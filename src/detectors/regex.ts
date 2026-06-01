import type { PiiMatch, PiiType, Detector } from "../types.js";

interface RegexRule {
  type: PiiType;
  /** Regex pattern (global, case-insensitive as needed) */
  pattern: RegExp;
  /** Label prefix for replacement (e.g. "EMAIL" → <EMAIL_1>) */
  label: string;
  /** Priority (lower = checked first, longer patterns have lower priority) */
  priority: number;
}

const RULES: RegexRule[] = [
  {
    type: "email",
    pattern: /[\w.!#$%&'*+/=?^`{|}~\-]+@[\w\-]+(?:\.[\w\-]+)+/gi,
    label: "EMAIL",
    priority: 1,
  },
  {
    type: "iban",
    pattern: /DE\d{2}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{2}/g,
    label: "IBAN",
    priority: 2,
  },
  {
    type: "phone",
    pattern: /(?:\+49|0049|0)[\s\-]?1[567]\d[\s\-]?\d{3,4}[\s\-]?\d{3,4}/g,
    label: "PHONE",
    priority: 3,
  },
  {
    type: "tax_id",
    pattern: /\b\d{2}\s?\d{3}\s?\d{3}\s?\d{3}\b/g,
    label: "TAX_ID",
    priority: 4,
  },
  {
    type: "api_key",
    pattern: /\b(sk|api|key)[-_][\w-]{15,}\b/g,
    label: "API_KEY",
    priority: 5,
  },
];

export class RegexDetector implements Detector {
  name = "regex";

  detect(text: string): PiiMatch[] {
    const allMatches: Array<{ match: PiiMatch; priority: number }> = [];
    const counters: Record<string, number> = {};

    for (const rule of RULES) {
      // Reset lastIndex for global regex
      rule.pattern.lastIndex = 0;

      let m: RegExpExecArray | null;
      while ((m = rule.pattern.exec(text)) !== null) {
        const matched = m[0];

        // Skip false positives: very short matches inside longer text
        if (matched.length < 4 && rule.type !== "email") continue;

        // Increment counter for this type
        counters[rule.label] = (counters[rule.label] || 0) + 1;

        allMatches.push({
          match: {
            type: rule.type,
            original: matched,
            replacement: `<${rule.label}_${counters[rule.label]}>`,
            startIndex: m.index,
            endIndex: m.index + matched.length,
          },
          priority: rule.priority,
        });
      }
    }

    // Sort by startIndex, then by length descending (longer matches first to avoid overlap)
    const sorted = allMatches.sort((a, b) => {
      if (a.match.startIndex !== b.match.startIndex) {
        return a.match.startIndex - b.match.startIndex;
      }
      return (
        b.match.original.length - a.match.original.length
      );
    });

    // Remove overlapping matches (keep longer/earlier ones)
    const filtered: PiiMatch[] = [];
    for (const item of sorted) {
      const last = filtered[filtered.length - 1];
      if (last && item.match.startIndex < last.endIndex) {
        continue; // Overlaps with previous match
      }
      filtered.push(item.match);
    }

    return filtered;
  }
}
