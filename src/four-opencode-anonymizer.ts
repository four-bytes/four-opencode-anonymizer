import type { Plugin } from "@opencode-ai/plugin";
import { RegexDetector } from "./detectors/regex.js";
import { createMappingStore } from "./mapping-store.js";
import { anonymizeText } from "./anon-pipeline.js";
import { getModeConfig } from "./modes.js";

export const FourAnonymizerPlugin: Plugin = async (_ctx) => {
  const detector = new RegexDetector();
  const store = createMappingStore();
  const mode = getModeConfig();

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

        if (!message || message.info?.role !== "user") return;

        const msgOutput = output as {
          parts?: Array<{ type: string; text?: string }>;
        };

        if (!msgOutput.parts) return;

        for (const part of msgOutput.parts) {
          if (part.type === "text" && part.text) {
            const result = anonymizeText(part.text, sessionId, detector, store, mode);

            if (result.count > 0) {
              part.text = result.text;
              // eslint-disable-next-line no-console
              console.error(
                `[four-anon] ${mode.mode}: anonymized ${result.count} PII for session ${sessionId}`,
              );
            }
          }
        }
      } catch {
        // Non-blocking
      }
    },
  };
};

export default FourAnonymizerPlugin;
