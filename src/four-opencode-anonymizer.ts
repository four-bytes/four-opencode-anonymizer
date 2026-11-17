import type { Plugin } from "@opencode-ai/plugin";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RegexDetector } from "./detectors/regex.js";
import { createSessionStore, type SessionStore } from "./session-store.js";
import { anonymizeText } from "./anon-pipeline.js";
import { anonymizeModelMessages, anonymizeSystem, type ModelBoundMessage } from "./model-bound.js";
import { getModeConfig } from "./modes.js";
import { logDebugEvent } from "./debug-logger.js";

// Read version from package.json at module load time (same pattern as four-opencode-brain)
const VERSION: string = JSON.parse(
  readFileSync(join(import.meta.dir, "..", "package.json"), "utf-8")
).version;

export const FourAnonymizerPlugin: Plugin = async (ctx) => {
  const detector = new RegexDetector();
  const mode = getModeConfig();
  const { client, directory } = ctx;

  // Per-session in-memory stores: no disk, no encryption, no cross-session bleed.
  // Lifecycle: created on first user message, deleted on `session.deleted`,
  // cleared on plugin dispose. See docs/model-bound-paths.md.
  const sessions = new Map<string, SessionStore>();

  const getSessionStore = (sessionId: string | undefined): SessionStore => {
    const id = sessionId || "unknown";
    let store = sessions.get(id);
    if (!store) {
      store = createSessionStore(id);
      sessions.set(id, store);
    }
    return store;
  };

  // Fire-and-forget log via opencode app log API — never blocking
  const log = (level: "debug" | "info" | "warn" | "error", message: string, extra?: Record<string, unknown>) => {
    client.app.log({
      body: { service: "four-anon", level, message, extra: extra as Record<string, unknown> },
      query: { directory },
    }).catch(() => { /* silently drop log errors */ });
  };

  log("info", `v${VERSION} loaded — mode: ${mode.mode} (store=${mode.storeMappings}, reversible=${mode.reversible})`);

  return {
    // ── chat.message: anonymize user input before it is persisted ──
    // Fires before the user message is saved (prompt.ts:983), so placeholders
    // (not originals) become history. Attached text/plain files have already
    // been expanded into synthetic text parts (prompt.ts:771-780), so they are
    // covered here. Binary attachments are not text-scannable (see docs).
    "chat.message": async (input, output) => {
      try {
        const sessionId = input.sessionID || "unknown";
        if (!output.parts || output.parts.length === 0) return;

        const sessionStore = getSessionStore(sessionId);

        // Anonymize: PII → placeholder
        let totalAnonCount = 0;
        let anonParts = 0;
        const allPiiTypes = new Set<string>();

        for (const part of output.parts) {
          if (part.type === "text" && part.text) {
            const result = anonymizeText(part.text, detector, sessionStore, mode);
            if (result.count > 0) {
              part.text = result.text;
              totalAnonCount += result.count;
              anonParts++;
              for (const match of result.matches) {
                allPiiTypes.add(match.type);
              }
              log("info", `${mode.mode}: anonymized ${result.count} PII`, {
                count: result.count,
                sessionId,
              });
            }
          }
        }

        if (totalAnonCount > 0) {
          logDebugEvent("anonymize", {
            sessionId,
            mode: mode.mode,
            piiFound: true,
            totalPiiCount: totalAnonCount,
            partsAffected: anonParts,
            piiTypes: [...allPiiTypes],
          });
        }
      } catch {
        // Non-blocking
      }
    },

    // ── Text complete: scrub assistant text before it is persisted ──
    // The returned text replaces the part that is written to session storage
    // (processor.ts:811-829) and later replayed to the provider. NEVER
    // rehydrate here: that would write originals into history. Display
    // rehydration is a separate, explicit `rehydrateForDisplay()` call.
    "experimental.text.complete": async (input, output) => {
      try {
        const store = getSessionStore(input.sessionID);
        const result = anonymizeText(output.text, detector, store, mode);
        output.text = result.text;
        if (result.count > 0) {
          log("info", `${mode.mode}: scrubbed assistant output before persist`, {
            count: result.count,
            sessionId: input.sessionID,
          });
        }
      } catch {
        // Non-blocking
      }
    },

    // ── Tool execute: scrub tool output before the model sees it ──
    // `output.output` is persisted as tool part state and replayed in later
    // requests (tools.ts:103-147, message-v2.ts:303-334). NEVER rehydrate.
    "tool.execute.after": async (input, output) => {
      try {
        const sid = input.sessionID || "unknown";
        const store = getSessionStore(sid);
        let count = 0;

        // Built-in tools expose `output` (tools.ts:103-147).
        if (typeof output.output === "string" && output.output) {
          const result = anonymizeText(output.output, detector, store, mode);
          output.output = result.text;
          count += result.count;
        }

        // MCP tools expose `content: [{ type: "text", text }]` instead
        // (tools.ts:116-150); scrub it here so the write-time path is covered too.
        const content = (output as unknown as { content?: Array<{ type?: string; text?: string }> }).content;
        if (Array.isArray(content)) {
          for (const item of content) {
            if (item && item.type === "text" && typeof item.text === "string") {
              const result = anonymizeText(item.text, detector, store, mode);
              item.text = result.text;
              count += result.count;
            }
          }
        }

        if (count > 0) {
          log("info", `${mode.mode}: scrubbed tool output for session ${sid}`, {
            count,
            sessionId: sid,
          });
        }
      } catch {
        // Non-blocking
      }
    },

    // ── Final gate for everything that reaches the provider ──
    // Runs right before toModelMessages (prompt.ts:1325-1331) and covers
    // history written before the plugin loaded, other plugins' additions,
    // reasoning parts, tool inputs/outputs and error text.
    "experimental.chat.messages.transform": async (_input, output) => {
      try {
        const count = anonymizeModelMessages(
          output.messages as unknown as ModelBoundMessage[],
          detector,
          getSessionStore,
          mode,
        );
        if (count > 0) {
          log("info", `${mode.mode}: scrubbed ${count} PII from model-bound history`, {
            count,
          });
          logDebugEvent("model-transform", { mode: mode.mode, totalPiiCount: count });
        }
      } catch {
        // Non-blocking
      }
    },

    // ── System prompt additions are model-bound too ──
    // request.ts:70 runs this for every provider request, including small tasks.
    "experimental.chat.system.transform": async (input, output) => {
      try {
        const store = getSessionStore(input.sessionID);
        const count = anonymizeSystem(output.system, detector, store, mode);
        if (count > 0) {
          log("info", `${mode.mode}: scrubbed ${count} PII from system prompt`, {
            count,
            sessionId: input.sessionID,
          });
        }
      } catch {
        // Non-blocking
      }
    },

    // ── Session lifecycle cleanup ──
    // Without this the in-memory map grows for the whole process lifetime.
    event: async (input) => {
      try {
        if (input.event.type === "session.deleted") {
          const sessionId = input.event.properties.info.id;
          sessions.delete(sessionId);
          log("debug", `session store cleared`, { sessionId });
        }
      } catch {
        // Non-blocking
      }
    },

    dispose: async () => {
      sessions.clear();
    },
  };
};

export default FourAnonymizerPlugin;
