import type { Detector, PiiMatch, AnonymizedContent } from "./types.js";
import type { MappingStore } from "./mapping-store.js";

/**
 * Full anonymization pipeline:
 * 1. Detect PII via Detector
 * 2. Store original→placeholder mappings
 * 3. Replace originals with placeholders in text
 */
export function anonymizeText(
  text: string,
  sessionId: string,
  detector: Detector,
  store: MappingStore,
): AnonymizedContent {
  const matches = detector.detect(text);

  if (matches.length === 0) {
    return { text, matches: [], count: 0 };
  }

  // Store mappings (resolve placeholder conflicts idempotently)
  for (const match of matches) {
    let placeholder = match.replacement;
    let attempt = 0;
    while (true) {
      const existing = store.getOriginal(placeholder);
      if (existing === null || existing === match.original) {
        break; // Available or already maps to same original
      }
      // Conflict: same placeholder for different original — append suffix
      attempt++;
      placeholder = match.replacement.replace(/>$/, `_${attempt}>`);
    }
    store.store(match.original, placeholder, match.type, sessionId);
    match.replacement = placeholder; // update for replacement step
  }

  // Replace in reverse order (to preserve startIndex positions)
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
