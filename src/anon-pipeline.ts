import type { Detector, PiiMatch, AnonymizedContent } from "./types.js";
import type { SessionStore } from "./session-store.js";
import { getModeConfig, type ModeConfig } from "./modes.js";

/** Generate generic placeholder (non-reversible, no counter) */
function genericPlaceholder(type: string): string {
  const map: Record<string, string> = {
    email: "[EMAIL]",
    iban: "[IBAN]",
    phone: "[PHONE]",
    tax_id: "[TAX_ID]",
    api_key: "[API_KEY]",
    name: "[NAME]",
    city: "[CITY]",
    credit_card: "[CREDIT_CARD]",
    bank_account: "[BANK_ACCOUNT]",
    reference: "[REFERENCE]",
  };
  return map[type] || `[${type.toUpperCase()}]`;
}

/**
 * Full anonymization pipeline.
 * Mode-aware: stores mappings for reversible modes, uses generic placeholders for irreversible.
 * Store is session-scoped: no cross-session bleed.
 */
export function anonymizeText(
  text: string,
  detector: Detector,
  store: SessionStore,
  mode?: ModeConfig,
): AnonymizedContent {
  const config = mode || getModeConfig();
  const matches = detector.detect(text);

  if (matches.length === 0) {
    return { text, matches: [], count: 0 };
  }

  // For irreversible: replace placeholders with generic labels
  if (!config.reversible) {
    for (const match of matches) {
      match.replacement = genericPlaceholder(match.type);
    }
  }

  // Store mappings (only for reversible modes)
  if (config.storeMappings) {
    for (const match of matches) {
      let placeholder = match.replacement;
      let attempt = 0;
      // Collision avoidance within this session: if placeholder is already
      // mapped to a different original, increment the number (<EMAIL_1> → <EMAIL_2>).
      // Same original is a no-op.
      const baseNumber = parseInt(match.replacement.match(/\d+>/)?.[0] || '1');
      while (true) {
        const existing = store.getOriginal(placeholder);
        if (existing === null || existing === match.original) {
          break;
        }
        attempt++;
        placeholder = match.replacement.replace(/\d+>/, `${baseNumber + attempt}>`);
      }
      store.store(match.original, placeholder, match.type);
      match.replacement = placeholder;
    }
  }

  // Replace in reverse order (preserve startIndex)
  const sorted = [...matches].sort((a, b) => b.startIndex - a.startIndex);
  let result = text;
  for (const match of sorted) {
    result =
      result.slice(0, match.startIndex) +
      match.replacement +
      result.slice(match.endIndex);
  }

  return {
    text: result,
    matches,
    count: matches.length,
  };
}
