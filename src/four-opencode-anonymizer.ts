import type { Plugin } from "@opencode-ai/plugin";
import { RegexDetector } from "./detectors/regex.js";
import { createSessionStore, type SessionStore } from "./session-store.js";
import { anonymizeText } from "./anon-pipeline.js";
import { rehydrateText } from "./rehydrate.js";
import { getModeConfig } from "./modes.js";
import { logDebugEvent } from "./debug-logger.js";

export const FourAnonymizerPlugin: Plugin = async (_ctx) => {
  const detector = new RegexDetector();
  const mode = getModeConfig();

  // Per-session in-memory stores: no disk, no encryption, no cross-session bleed
  const sessions = new Map<string, SessionStore>();

  // eslint-disable-next-line no-console
  console.error(`[four-anon] mode: ${mode.mode} (store=${mode.storeMappings}, reversible=${mode.reversible})`);

  return {
    "chat.message": async (input, output) => {
      try {
        const msgInput = input as { sessionID?: string; message?: unknown };
        const sessionId = msgInput.sessionID || "unknown";

        const message = msgInput.message as {
          info?: { role?: string };
        } | undefined;

        if (!message) return;

        const msgOutput = output as {
          parts?: Array<{ type: string; text?: string }>;
        };

        if (!msgOutput.parts) return;

        if (message.info?.role === "user") {
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

          for (const part of msgOutput.parts) {
            if (part.type === "text" && part.text) {
              const result = anonymizeText(part.text, detector, sessionStore, mode);
              if (result.count > 0) {
                part.text = result.text;
                totalAnonCount += result.count;
                anonParts++;
                for (const match of result.matches) {
                  allPiiTypes.add(match.type);
                }
                // eslint-disable-next-line no-console
                console.error(`[four-anon] ${mode.mode}: anonymized ${result.count} PII for session ${sessionId}`);
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
        } else if (message.info?.role === "assistant") {
          // Get session store (must exist from user message)
          const sessionStore = sessions.get(sessionId);
          if (!sessionStore) return; // No mappings = nothing to rehydrate

          // Rehydrate: placeholder → original PII
          let rehydratedParts = 0;
          let totalRehydrated = 0;

          for (const part of msgOutput.parts) {
            if (part.type === "text" && part.text) {
              const original = part.text;
              part.text = rehydrateText(part.text, sessionStore);
              if (part.text !== original) {
                rehydratedParts++;
                const beforeCount = (original.match(/<[A-Z]+_\d+>/g) || []).length;
                const afterCount = (part.text.match(/<[A-Z]+_\d+>/g) || []).length;
                totalRehydrated += beforeCount - afterCount;
                // eslint-disable-next-line no-console
                console.error(`[four-anon] ${mode.mode}: rehydrated placeholders in assistant message`);
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
