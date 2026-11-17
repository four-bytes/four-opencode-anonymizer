import type { SessionStore } from "./session-store.js";
import { getModeConfig } from "./modes.js";

/**
 * Rehydrate placeholders for **display only**.
 *
 * HARD RULE: never pass the result of this function into a message part, tool
 * output, tool argument, system prompt or anything else the model provider may
 * receive. Model-bound content is scrubbed by `src/model-bound.ts`; rehydrating
 * it would write originals back into session history and every later request.
 * opencode has no display-only hook for server plugins, so this plugin does not
 * call this function automatically — a TUI/CLI layer may call it for rendering.
 *
 * Only works in reversible modes (redact_for_llm, redact_for_logs,
 * redact_for_memory). In irreversible_export mode, returns text unchanged.
 * Store is session-scoped: placeholders from other sessions have no mapping here.
 */
export function rehydrateForDisplay(text: string, store: SessionStore): string {
  const mode = getModeConfig();
  if (!mode.reversible) return text;

  // Match reversible placeholders: <EMAIL_1>, <PHONE_2>, etc. — all 10 types
  const placeholderPattern = /<(EMAIL|IBAN|PHONE|TAX_ID|API_KEY|NAME|CITY|CREDIT_CARD|BANK_ACCOUNT|REFERENCE)_\d+(?:_\d+)*>/g;

  return text.replace(placeholderPattern, (match) => {
    const original = store.getOriginal(match);
    return original ?? match; // Unknown placeholder (from another session?): leave as-is
  });
}
