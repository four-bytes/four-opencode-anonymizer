import type { MappingStore } from "./mapping-store.js";
import { getModeConfig } from "./modes.js";

/**
 * Rehydrate: replace placeholders back to original PII.
 * Only works in reversible modes (redact_for_llm, redact_for_logs, redact_for_memory).
 * In irreversible_export mode, returns text unchanged.
 */
export function rehydrateText(text: string, store: MappingStore): string {
  const mode = getModeConfig();
  if (!mode.reversible) return text;

  // Match reversible placeholders: <EMAIL_1>, <PHONE_2>, etc.
  const placeholderPattern = /<(EMAIL|IBAN|PHONE|TAX_ID|API_KEY)_\d+>/g;

  return text.replace(placeholderPattern, (match) => {
    const original = store.getOriginal(match);
    return original ?? match; // Unknown placeholder: leave as-is
  });
}
