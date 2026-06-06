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

        // Only process messages with a recognized role
        if (!msgRole) return;
        if (!output.parts || output.parts.length === 0) return;

        if (msgRole === "user") {
          // Get or create session store
          let sessionStore = sessions.get(sessionId);
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
                log("info", `${mode.mode}: anonymized ${result.count} PII for session ${sessionId}`, {
                  count: result.count,
                  sessionId,
                });
              }
            }
          }

          logDebugEvent("anonymize", {
            sessionId,
            mode: mode.mode,
            piiFound: totalAnonCount > 0,
            ...(totalAnonCount > 0
              ? {
                  totalPiiCount: totalAnonCount,
                  partsAffected: anonParts,
                  piiTypes: [...allPiiTypes],
                }
              : {}),
          });
        } else if (msgRole === "assistant") {
          // Get session store (must exist from user message)
          const sessionStore = sessions.get(sessionId);
          if (!sessionStore) return; // No mappings = nothing to rehydrate

          // Rehydrate: placeholder → original PII
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
                log("info", `${mode.mode}: rehydrated placeholders in assistant message`, {
                  sessionId,
                });
              }
            }
          }

          logDebugEvent("rehydrate", {
            sessionId,
            mode: mode.mode,
            rehydrated: rehydratedParts > 0,
            ...(rehydratedParts > 0
              ? {
                  partsAffected: rehydratedParts,
                  placeholdersRehydrated: totalRehydrated,
                }
              : {}),
          });
        }
      } catch {
        // Non-blocking
      }
    },
  };
};

export default FourAnonymizerPlugin;
