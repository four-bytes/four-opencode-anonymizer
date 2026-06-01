import type { Plugin } from "@opencode-ai/plugin";
import { RegexDetector } from "./detectors/regex.js";
import { createMappingStore } from "./mapping-store.js";
import { anonymizeText } from "./anon-pipeline.js";

/**
 * PII Anonymization Plugin (Wave P4c).
 */
export const FourAnonymizerPlugin: Plugin = async (_ctx) => {
  const detector = new RegexDetector();
  const store = createMappingStore();

  return {
    "chat.message": async (input, output) => {
      try {
        const msgInput = input as { sessionID?: string; message?: unknown };
        const sessionId = msgInput.sessionID || "unknown";

        const message = msgInput.message as {
          info?: { role?: string };
        } | undefined;

        // Only anonymize user messages before they reach the LLM
        if (!message || message.info?.role !== "user") return;

        const msgOutput = output as {
          parts?: Array<{ type: string; text?: string }>;
        };

        if (!msgOutput.parts) return;

        for (const part of msgOutput.parts) {
          if (part.type === "text" && part.text) {
            const result = anonymizeText(part.text, sessionId, detector, store);

            if (result.count > 0) {
              part.text = result.text;
              // eslint-disable-next-line no-console
              console.error(
                `[four-anon] anonymized ${result.count} PII instances for session ${sessionId}`,
              );
            }
          }
        }
      } catch {
        // Non-blocking — never throw from hook
      }
    },
  };
};

export default FourAnonymizerPlugin;
