import type { Detector } from "./types.js";
import type { SessionStore } from "./session-store.js";
import { anonymizeText } from "./anon-pipeline.js";
import type { ModeConfig } from "./modes.js";

/**
 * Final anonymization gate for **model-bound** content.
 *
 * Everything in here removes data from what the LLM provider receives. Nothing
 * in here restores data (`rehydrateForDisplay` is deliberately NOT imported) —
 * a rehydrated value written back into a message part or a tool result would
 * become part of the next request's history. See docs/model-bound-paths.md.
 *
 * Model-bound surfaces covered (evidence: opencode commit b8a3706):
 * - user/assistant text parts and reasoning parts → `toModelMessages` maps them
 *   into the provider payload (packages/opencode/src/session/message-v2.ts:218-382)
 * - completed tool parts → `state.input` and `state.output` are sent
 *   (message-v2.ts:303-334)
 * - tool error parts → `state.error` / `state.metadata.output` become `errorText`
 *   (message-v2.ts:336-370)
 * - system additions → `experimental.chat.system.transform`
 *   (packages/opencode/src/session/llm/request.ts:70)
 */

/** Minimal structural view of an opencode message part (avoids importing upstream types). */
export interface ModelBoundPart {
  type: string;
  text?: string;
  state?: {
    status?: string;
    input?: unknown;
    output?: unknown;
    error?: string;
    metadata?: Record<string, unknown> | null;
  } | null;
}

export interface ModelBoundMessage {
  info?: { sessionID?: string; role?: string } | null;
  parts: ModelBoundPart[];
}

export interface AnonymizeResult {
  /** Number of PII instances replaced */
  count: number;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Anonymize every string inside a tool argument/input structure.
 * Tool inputs are model-bound JSON (message-v2.ts:303-334) and may echo
 * originals from tool output or earlier history.
 */
export function anonymizeValue(
  value: unknown,
  detector: Detector,
  store: SessionStore,
  mode: ModeConfig,
): { value: unknown; count: number } {
  if (typeof value === "string") {
    const result = anonymizeText(value, detector, store, mode);
    return { value: result.text, count: result.count };
  }

  if (Array.isArray(value)) {
    let count = 0;
    const next = value.map((item) => {
      const result = anonymizeValue(item, detector, store, mode);
      count += result.count;
      return result.value;
    });
    return { value: next, count };
  }

  if (isPlainObject(value)) {
    let count = 0;
    const next: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      const result = anonymizeValue(item, detector, store, mode);
      count += result.count;
      next[key] = result.value;
    }
    return { value: next, count };
  }

  return { value, count: 0 };
}

/** Anonymize one model-bound message part in place. */
export function anonymizePart(
  part: ModelBoundPart,
  detector: Detector,
  store: SessionStore,
  mode: ModeConfig,
): number {
  let count = 0;

  // Text and reasoning are both replayed to the provider.
  if ((part.type === "text" || part.type === "reasoning") && typeof part.text === "string") {
    const result = anonymizeText(part.text, detector, store, mode);
    part.text = result.text;
    count += result.count;
  }

  // Tool results: input + output reach the provider, error text too.
  if (part.type === "tool" && part.state) {
    const state = part.state;

    if (typeof state.output === "string") {
      const result = anonymizeText(state.output, detector, store, mode);
      state.output = result.text;
      count += result.count;
    }

    if (typeof state.error === "string") {
      const result = anonymizeText(state.error, detector, store, mode);
      state.error = result.text;
      count += result.count;
    }

    // Interrupted tools replay `metadata.output` as the tool result.
    const interruptedOutput = state.metadata?.output;
    if (typeof interruptedOutput === "string") {
      const result = anonymizeText(interruptedOutput, detector, store, mode);
      state.metadata!.output = result.text;
      count += result.count;
    }

    if (state.input !== undefined) {
      const result = anonymizeValue(state.input, detector, store, mode);
      state.input = result.value;
      count += result.count;
    }
  }

  return count;
}

/**
 * Anonymize a full message list at request time. This is the catch-all gate for
 * history that predates the plugin, other plugins' additions and any path the
 * earlier hooks missed. `experimental.chat.messages.transform` runs immediately
 * before `toModelMessages` (prompt.ts:1325-1331).
 */
export function anonymizeModelMessages(
  messages: ModelBoundMessage[],
  detector: Detector,
  getStore: (sessionId: string) => SessionStore,
  mode: ModeConfig,
): number {
  let count = 0;
  for (const message of messages) {
    const sessionId = message.info?.sessionID || "unknown";
    const store = getStore(sessionId);
    for (const part of message.parts ?? []) {
      count += anonymizePart(part, detector, store, mode);
    }
  }
  return count;
}

/** Anonymize system prompt additions (`experimental.chat.system.transform`). */
export function anonymizeSystem(
  system: string[],
  detector: Detector,
  store: SessionStore,
  mode: ModeConfig,
): number {
  let count = 0;
  for (let i = 0; i < system.length; i++) {
    const result = anonymizeText(system[i], detector, store, mode);
    system[i] = result.text;
    count += result.count;
  }
  return count;
}
