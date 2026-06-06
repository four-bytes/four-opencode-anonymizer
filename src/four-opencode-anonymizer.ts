import type { Plugin } from "@opencode-ai/plugin";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RegexDetector } from "./detectors/regex.js";
import { createSessionStore, type SessionStore } from "./session-store.js";
import { anonymizeText } from "./anon-pipeline.js";
import { rehydrateText } from "./rehydrate.js";
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

  // Per-session in-memory stores: no disk, no encryption, no cross-session bleed
  const sessions = new Map<string, SessionStore>();

  // Fire-and-forget log via opencode app log API — never blocking
  const log = (level: "debug" | "info" | "warn" | "error", message: string, extra?: Record<string, unknown>) => {
    client.app.log({
      body: { service: "four-anon", level, message, extra: extra as Record<string, unknown> },
      query: { directory },
    }).catch(() => { /* silently drop log errors */ });
  };

  log("info", `v${VERSION} loaded — mode: ${mode.mode} (store=${mode.storeMappings}, reversible=${mode.reversible})`);

  return {
    "chat.message": async (input, output) => {
      try {
        const sessionId = input.sessionID || "unknown";
        const msgRole = output.message?.role;

        if (!output.parts || output.parts.length === 0) return;

        // ── Rehydrate FIRST (always, if session has mappings) ──────
        // Handles assistant messages, thought output, and any message
        // containing placeholders from this session. User messages have
        // no placeholders at this point → rehydrate is a safe no-op.
        let sessionStore = sessions.get(sessionId);
        if (sessionStore) {
          const modeLabel = mode.mode;
          let rehydratedParts = 0;
          let totalRehydrated = 0;

          for (const part of output.parts) {
            if (part.type === "text" && part.text) {
              const original = part.text;
              part.text = rehydrateText(part.text, sessionStore);
              if (part.text !== original) {
                rehydratedParts++;
                const beforeCount = (original.match(/<[A-Z]+_\d+>/g) || []).length;
                const afterCount = (part.text.match(/<[A-Z]+_\d+>/g) || []).length;
                totalRehydrated += beforeCount - afterCount;
                log("info", `${modeLabel}: rehydrated placeholders`, {
                  sessionId,
                  count: beforeCount - afterCount,
                });
              }
            }
          }

          if (rehydratedParts > 0) {
            logDebugEvent("rehydrate", {
              sessionId,
              mode: modeLabel,
              rehydrated: true,
              partsAffected: rehydratedParts,
              placeholdersRehydrated: totalRehydrated,
            });
          }
        }

        // ── Anonymize (user messages only) ──────────────────────────
        if (msgRole === "user") {
          // Get or create session store
          if (!sessionStore) {
            sessionStore = createSessionStore(sessionId);
            sessions.set(sessionId, sessionStore);
          }

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
        }
      } catch {
        // Non-blocking
      }
    },

    // ── Event hook: rehydrate parts in-place on every update ───
    // Catches streaming output (assistant messages, thought text,
    // tool results) that may not go through chat.message.
    "event": async (eventInput) => {
      try {
        const evt = eventInput.event;
        if (evt.type !== "message.part.updated") return;

        const part = evt.properties.part as { type?: string; text?: string; sessionID?: string };
        if (part.type !== "text" || !part.text) return;

        const sid = part.sessionID || "unknown";
        const store = sessions.get(sid);
        if (!store) return;

        const original = part.text;
        part.text = rehydrateText(part.text, store);
        if (part.text !== original) {
          log("info", `${mode.mode}: event-rehydrated part for session ${sid}`, {
            sessionId: sid,
          });
        }
      } catch {
        // Non-blocking
      }
    },

    // ── Tool execute: rehydrate subagent/tool output ────────────
    "tool.execute.after": async (_input, output) => {
      try {
        // Subagent results arrive as tool output — rehydrate placeholders
        const sid = (_input as { sessionID?: string }).sessionID || "unknown";
        const store = sessions.get(sid);
        if (!store || !output.output) return;

        const original = output.output;
        output.output = rehydrateText(output.output, store);
        if (output.output !== original) {
          log("info", `${mode.mode}: rehydrated tool output for session ${sid}`, {
            sessionId: sid,
          });
        }
      } catch {
        // Non-blocking
      }
    },
  };
};

export default FourAnonymizerPlugin;
