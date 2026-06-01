import { describe, it, expect } from "bun:test";
import { RegexDetector } from "../src/detectors/regex.js";

const detector = new RegexDetector();

describe("RegexDetector", () => {
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

  it("detects German mobile phone numbers", () => {
    const matches = detector.detect("Call me: +49 170 1234567 or 0170 1234567");
    const phones = matches.filter((m) => m.type === "phone");
    expect(phones.length).toBeGreaterThanOrEqual(1);
    expect(phones[0].replacement).toMatch(/^<PHONE_\d+>$/);
  });

  it("detects German tax IDs (11 digits)", () => {
    const matches = detector.detect("Steuer-ID: 12 345 678 901 for filing");
    const tax = matches.find((m) => m.type === "tax_id");
    expect(tax).toBeDefined();
    expect(tax!.replacement).toMatch(/^<TAX_ID_\d+>$/);
  });

  it("detects API keys (sk-... prefix)", () => {
    const matches = detector.detect("Authorization: sk-proj-abc123def456ghijklmnop");
    const key = matches.find((m) => m.type === "api_key");
    expect(key).toBeDefined();
    expect(key!.replacement).toMatch(/^<API_KEY_\d+>$/);
  });

  it("returns empty array for clean text", () => {
    const matches = detector.detect("Just a normal sentence with no PII.");
    expect(matches.length).toBe(0);
  });

  it("does not create overlapping matches", () => {
    // Text with email that contains digits that could match other patterns
    const matches = detector.detect("user.12345@gmail.com");
    const emails = matches.filter((m) => m.type === "email");
    expect(emails.length).toBe(1);
    // No tax_id match on the digits inside the email
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

  it("detects phone with 0049 prefix", () => {
    const matches = detector.detect("Tel: 0049 171 1234567");
    const phones = matches.filter((m) => m.type === "phone");
    expect(phones.length).toBe(1);
  });
});
