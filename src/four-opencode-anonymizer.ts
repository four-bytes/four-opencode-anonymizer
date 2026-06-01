import type { Plugin } from "@opencode-ai/plugin";

/**
 * PII Anonymization Plugin (Wave P4c).
 *
 * Detects and replaces PII (email, IBAN, phone, tax IDs, API keys)
 * before sending data to LLM providers. Reversible via SQLite+AES vault.
 *
 * 4 Modi: redact_for_llm, redact_for_logs, redact_for_memory, irreversible_export
 */
export const FourAnonymizerPlugin: Plugin = async (_ctx) => {
  return {
    "chat.message": async (_input, _output) => {
      // Placeholder — full anonymization in a #neu4
    },
  };
};

export default FourAnonymizerPlugin;
