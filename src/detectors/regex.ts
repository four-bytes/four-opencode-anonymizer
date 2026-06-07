import type { PiiMatch, PiiType, Detector } from "../types.js";

/** Luhn algorithm check for credit card numbers */
function luhnCheck(digits: string): boolean {
  const cleaned = digits.replace(/[\s\-]/g, "");
  if (cleaned.length < 13 || cleaned.length > 19) return false;
  let sum = 0;
  let alternate = false;
  for (let i = cleaned.length - 1; i >= 0; i--) {
    let n = parseInt(cleaned[i], 10);
    if (isNaN(n)) return false;
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

interface RegexRule {
  type: PiiType;
  /** Regex pattern (global, case-insensitive as needed) */
  pattern: RegExp;
  /** Label prefix for replacement (e.g. "EMAIL" → <EMAIL_1>) */
  label: string;
  /** Priority (lower = checked first) */
  priority: number;
  /** Optional post-match validator. Return false to discard the match. */
  validate?: (match: string) => boolean;
}

const RULES: RegexRule[] = [
  // ── Email ──────────────────────────────────────────────
  {
    type: "email",
    pattern: /[\w.!#$%&'*+/=?^`{|}~\-]+@[\w\-]+(?:\.[\w\-]+)+/gi,
    label: "EMAIL",
    priority: 1,
  },
  // ── IBAN (international: 3–7 groups of 4 + 0–4 remainder) ─
  {
    type: "iban",
    pattern: /\b[A-Z]{2}\d{2}[ ]?(?:[A-Z0-9]{4}[ ]?){3,7}[A-Z0-9]{0,4}\b/g,
    label: "IBAN",
    priority: 2,
  },
  // ── Phone (German mobile/landline) ─────────────────────
  {
    type: "phone",
    pattern: /(?:\+49|0049|0)[\s\-]?1[567]\d[\s\-]?\d{3,4}[\s\-]?\d{3,4}/g,
    label: "PHONE",
    priority: 3,
  },
  // ── Tax ID (keyword-triggered, refined) ────────────────
  {
    type: "tax_id",
    pattern: /\b(?:Steuer(?:-?ID|-?nummer)?|St\.-Nr\.|Steuerliche\s*Identifikationsnummer|Tax\s*ID|TIN|USt-IdNr\.|Umsatzsteuer(?:-?ID)?)\s*[:#]?\s*(?:[A-Z]{2})?\s?\d{2}[\s]?\d{3}[\s]?\d{3}[\s]?\d{1,5}\b/gi,
    label: "TAX_ID",
    priority: 4,
    validate: (match) => {
      // Ensure at least 9 digits (USt-IdNr: DE + 9 digits)
      const digits = match.replace(/[\s]/g, "").match(/\d+/);
      return digits !== null && digits[0].length >= 9;
    },
  },
  // ── API Key ────────────────────────────────────────────
  {
    type: "api_key",
    pattern: /\b(sk|api|key)[-_][\w-]{15,}\b/g,
    label: "API_KEY",
    priority: 5,
  },
  // ── Credit Card (Luhn-validated) ───────────────────────
  {
    type: "credit_card",
    pattern: /\b[0-9]{4}[ -]?[0-9]{4}[ -]?[0-9]{4}[ -]?[0-9]{4}\b/g,
    label: "CREDIT_CARD",
    priority: 6,
    validate: luhnCheck,
  },
  // ── Bank Account (keyword-triggered) ───────────────────
  {
    type: "bank_account",
    pattern: /\b(?:Konto(?:-?nummer)?|Kto\.-Nr\.|Bankverbindung|BLZ|Bankleitzahl)\s*[:#]?\s*(\d{3,10})\b/gi,
    label: "BANK_ACCOUNT",
    priority: 7,
  },
  // ── Reference Number (keyword-triggered) ───────────────
  {
    type: "reference",
    pattern: /\b(?:Referenz|Ref\.|Kunden(?:-?nummer)?|Kd\.-Nr\.|Vorgangs(?:-?nummer)?|Rechnungs(?:-?nummer)?|RG\.-Nr\.|Auftrags(?:-?nummer)?|Beleg(?:-?nummer)?|Ticket(?:-?nummer)?|Fall(?:-?nummer)?)\b\s*[:#]?\s*([A-Z0-9][\-A-Z0-9\/]{2,40})\b/gi,
    label: "REFERENCE",
    priority: 8,
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

        // Post-match validator (e.g. Luhn for credit cards, digit count for tax_id)
        if (rule.validate && !rule.validate(matched)) continue;

        // Skip false positives: very short matches (unless email)
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
      return b.match.original.length - a.match.original.length;
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
