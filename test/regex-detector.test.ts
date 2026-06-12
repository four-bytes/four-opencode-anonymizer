import { describe, it, expect } from "bun:test";
import { RegexDetector } from "../src/detectors/regex.js";

const detector = new RegexDetector();

describe("RegexDetector", () => {
  // ── Email ─────────────────────────────────────────────
  it("detects email addresses", () => {
    const matches = detector.detect("Contact: john.doe@example.com for details");
    expect(matches.length).toBeGreaterThanOrEqual(1);
    const email = matches.find((m) => m.type === "email");
    expect(email).toBeDefined();
    expect(email!.original).toBe("john.doe@example.com");
    expect(email!.replacement).toMatch(/^<EMAIL_\d+>$/);
  });

  it("detects multiple emails", () => {
    const matches = detector.detect("a@b.com and c@d.de");
    const emails = matches.filter((m) => m.type === "email");
    expect(emails.length).toBe(2);
  });

  // ── IBAN ──────────────────────────────────────────────
  it("detects German IBAN", () => {
    const matches = detector.detect("IBAN: DE89370400440532013000 for transfer");
    const iban = matches.find((m) => m.type === "iban");
    expect(iban).toBeDefined();
    expect(iban!.replacement).toMatch(/^<IBAN_\d+>$/);
  });

  it("detects IBAN with spaces", () => {
    const matches = detector.detect("DE89 3704 0044 0532 0130 00");
    const iban = matches.find((m) => m.type === "iban");
    expect(iban).toBeDefined();
  });

  it("detects international IBAN (French)", () => {
    const matches = detector.detect("Virement vers FR76 3000 6000 0112 3456 7890 189");
    const iban = matches.find((m) => m.type === "iban");
    expect(iban).toBeDefined();
    expect(iban!.original).toContain("FR76");
  });

  it("detects international IBAN (Austrian)", () => {
    const matches = detector.detect("AT61 1904 3002 3457 3201");
    const iban = matches.find((m) => m.type === "iban");
    expect(iban).toBeDefined();
    expect(iban!.type).toBe("iban");
  });

  it("detects international IBAN (Dutch)", () => {
    const matches = detector.detect("NL91 ABNA 0417 1643 00");
    const iban = matches.find((m) => m.type === "iban");
    expect(iban).toBeDefined();
  });

  // ── Phone ─────────────────────────────────────────────
  it("detects German mobile phone numbers", () => {
    const matches = detector.detect("Call me: +49 170 1234567 or 0170 1234567");
    const phones = matches.filter((m) => m.type === "phone");
    expect(phones.length).toBeGreaterThanOrEqual(1);
    expect(phones[0].replacement).toMatch(/^<PHONE_\d+>$/);
  });

  it("detects phone with 0049 prefix", () => {
    const matches = detector.detect("Tel: 0049 171 1234567");
    const phones = matches.filter((m) => m.type === "phone");
    expect(phones.length).toBe(1);
  });

  // ── Tax ID (keyword-triggered) ───────────────────────
  it("detects German tax ID with Steuer-ID keyword", () => {
    const matches = detector.detect("Steuer-ID: 12 345 678 901 for filing");
    const tax = matches.find((m) => m.type === "tax_id");
    expect(tax).toBeDefined();
    expect(tax!.replacement).toMatch(/^<TAX_ID_\d+>$/);
  });

  it("detects tax ID with St.-Nr. keyword", () => {
    const matches = detector.detect("St.-Nr. 98 765 432 109");
    const tax = matches.find((m) => m.type === "tax_id");
    expect(tax).toBeDefined();
  });

  it("detects Umsatzsteuer-ID", () => {
    const matches = detector.detect("Umsatzsteuer-ID: DE123456789");
    const tax = matches.find((m) => m.type === "tax_id");
    expect(tax).toBeDefined();
  });

  it("does NOT detect bare 11-digit number without keyword context", () => {
    // This used to match but now requires keyword context
    const matches = detector.detect("Just a number: 12 345 678 901 sitting here");
    const tax = matches.find((m) => m.type === "tax_id");
    expect(tax).toBeUndefined();
  });

  // ── API Key ───────────────────────────────────────────
  it("detects API keys (sk-... prefix)", () => {
    const matches = detector.detect("Authorization: sk-proj-abc123def456ghijklmnop");
    const key = matches.find((m) => m.type === "api_key");
    expect(key).toBeDefined();
    expect(key!.replacement).toMatch(/^<API_KEY_\d+>$/);
  });

  // ── Credit Card (Luhn-validated) ─────────────────────
  it("detects valid credit card number (Visa test number)", () => {
    const matches = detector.detect("Payment with 4111 1111 1111 1111 was accepted");
    const cc = matches.find((m) => m.type === "credit_card");
    expect(cc).toBeDefined();
    expect(cc!.replacement).toMatch(/^<CREDIT_CARD_\d+>$/);
  });

  it("detects credit card without spaces", () => {
    const matches = detector.detect("Card: 4111111111111111");
    const cc = matches.find((m) => m.type === "credit_card");
    expect(cc).toBeDefined();
    expect(cc!.original).toBe("4111111111111111");
  });

  it("detects credit card with dashes", () => {
    const matches = detector.detect("4111-1111-1111-1111 is the number");
    const cc = matches.find((m) => m.type === "credit_card");
    expect(cc).toBeDefined();
  });

  it("rejects invalid credit card number (fails Luhn)", () => {
    const matches = detector.detect("Card: 1234 5678 9012 3456");
    const cc = matches.find((m) => m.type === "credit_card");
    expect(cc).toBeUndefined();
  });

  it("detects valid Mastercard test number", () => {
    const matches = detector.detect("5500 0000 0000 0004");
    const cc = matches.find((m) => m.type === "credit_card");
    expect(cc).toBeDefined();
  });

  // ── Bank Account (keyword-triggered) ─────────────────
  it("detects bank account with Kontonummer keyword", () => {
    const matches = detector.detect("Kontonummer: 1234567890 bei der Sparkasse");
    const ba = matches.find((m) => m.type === "bank_account");
    expect(ba).toBeDefined();
    expect(ba!.replacement).toMatch(/^<BANK_ACCOUNT_\d+>$/);
  });

  it("detects bank account with Konto keyword", () => {
    const matches = detector.detect("Bitte überweisen auf Konto 987654321");
    const ba = matches.find((m) => m.type === "bank_account");
    expect(ba).toBeDefined();
  });

  it("detects bank account with Kto.-Nr. abbreviation", () => {
    const matches = detector.detect("Kto.-Nr. 4567890");
    const ba = matches.find((m) => m.type === "bank_account");
    expect(ba).toBeDefined();
  });

  it("detects bank account with BLZ", () => {
    const matches = detector.detect("BLZ 37040044");
    const ba = matches.find((m) => m.type === "bank_account");
    expect(ba).toBeDefined();
  });

  // ── Reference Numbers (keyword-triggered) ────────────
  it("detects reference number with Referenz keyword", () => {
    const matches = detector.detect("Referenz: ABC-12345-XYZ bitte angeben");
    const ref = matches.find((m) => m.type === "reference");
    expect(ref).toBeDefined();
    expect(ref!.replacement).toMatch(/^<REFERENCE_\d+>$/);
  });

  it("detects Kundennummer", () => {
    const matches = detector.detect("Ihre Kundennummer: KD-987654321");
    const ref = matches.find((m) => m.type === "reference");
    expect(ref).toBeDefined();
  });

  it("detects Rechnungsnummer", () => {
    const matches = detector.detect("Rechnungsnummer: RG-2024-001234");
    const ref = matches.find((m) => m.type === "reference");
    expect(ref).toBeDefined();
  });

  it("detects Auftragsnummer", () => {
    const matches = detector.detect("Auftragsnummer: A-98765");
    const ref = matches.find((m) => m.type === "reference");
    expect(ref).toBeDefined();
  });

  it("detects Ticketnummer", () => {
    const matches = detector.detect("Ticketnummer: TKT-12345");
    const ref = matches.find((m) => m.type === "reference");
    expect(ref).toBeDefined();
  });

  // ── Currency (must NOT be caught) ────────────────────
  it("does NOT detect euro currency amount", () => {
    const matches = detector.detect("Der Betrag ist 1.234,67 €");
    expect(matches.length).toBe(0);
  });

  it("does NOT detect dollar currency amount", () => {
    const matches = detector.detect("Total: $1,234.56");
    expect(matches.length).toBe(0);
  });

  it("does NOT detect EUR currency amount", () => {
    const matches = detector.detect("Summe: 12.345,00 EUR");
    expect(matches.length).toBe(0);
  });

  // ── Edge Cases ────────────────────────────────────────
  it("returns empty array for clean text", () => {
    const matches = detector.detect("Just a normal sentence with no PII.");
    expect(matches.length).toBe(0);
  });

  it("does not create overlapping matches", () => {
    const matches = detector.detect("user.12345@gmail.com");
    const emails = matches.filter((m) => m.type === "email");
    expect(emails.length).toBe(1);
    const taxIds = matches.filter((m) => m.type === "tax_id");
    expect(taxIds.length).toBe(0);
  });

  it("handles empty string", () => {
    const matches = detector.detect("");
    expect(matches).toEqual([]);
  });

  it("counts replacements correctly", () => {
    const text = "alice@a.de and bob@b.de";
    const matches = detector.detect(text);
    const emails = matches.filter((m) => m.type === "email");
    expect(emails.length).toBe(2);
    expect(emails[0].replacement).toBe("<EMAIL_1>");
    expect(emails[1].replacement).toBe("<EMAIL_2>");
  });

  // ── English/Tech Word False-Positive Regression (#35)
  it("does NOT detect common English/tech words as PII", () => {
    const safeWords = [
      "ticket", "chat", "teams", "fallback", "reference",
      "account", "key", "case", "id", "session", "message", "token",
    ];
    for (const word of safeWords) {
      const matches = detector.detect(
        `The ${word} was processed successfully.`
      );
      if (matches.length > 0) {
        throw new Error(`Word "${word}" was falsely detected as PII: ${matches[0].type} (${matches[0].match})`);
      }
    }
  });
});
