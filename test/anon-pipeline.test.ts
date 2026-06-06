import { describe, it, expect, beforeEach } from "bun:test";
import { anonymizeText } from "../src/anon-pipeline.js";
import { RegexDetector } from "../src/detectors/regex.js";
import { createSessionStore } from "../src/session-store.js";

describe("anonymizeText", () => {
  let detector: RegexDetector;

  beforeEach(() => {
    detector = new RegexDetector();
  });

  it("anonymizes email in text", () => {
    const store = createSessionStore("session-1");
    const result = anonymizeText(
      "Contact alice@example.com for help",
      detector,
      store,
    );
    expect(result.count).toBeGreaterThanOrEqual(1);
    expect(result.text).not.toContain("alice@example.com");
    expect(result.text).toContain("<EMAIL_");
  });

  it("stores mapping and can retrieve original", () => {
    const store = createSessionStore("session-2");
    const result = anonymizeText(
      "Email: bob@test.de",
      detector,
      store,
    );
    const emailMatch = result.matches.find((m) => m.type === "email");
    expect(emailMatch).toBeDefined();

    const original = store.getOriginal(emailMatch!.replacement);
    expect(original).toBe("bob@test.de");
  });

  it("anonymizes multiple PII types in one text", () => {
    const store = createSessionStore("session-3");
    const text = "Mail: me@test.de, IBAN: DE89370400440532013000, Tel: +49 170 1234567";
    const result = anonymizeText(text, detector, store);

    expect(result.count).toBeGreaterThanOrEqual(3);
    expect(result.text).not.toContain("me@test.de");
    expect(result.text).not.toContain("DE89370400440532013000");
    expect(result.text).not.toContain("+49 170 1234567");
    expect(result.text).toContain("<EMAIL_");
    expect(result.text).toContain("<IBAN_");
    expect(result.text).toContain("<PHONE_");
  });

  it("returns unchanged text when no PII found", () => {
    const store = createSessionStore("session-4");
    const text = "Just a normal sentence with no personal data.";
    const result = anonymizeText(text, detector, store);
    expect(result.count).toBe(0);
    expect(result.text).toBe(text);
  });

  it("handles empty string", () => {
    const store = createSessionStore("session-5");
    const result = anonymizeText("", detector, store);
    expect(result.count).toBe(0);
    expect(result.text).toBe("");
  });

  it("session isolation: stores only see their own mappings", () => {
    const storeA = createSessionStore("session-a");
    const storeB = createSessionStore("session-b");

    anonymizeText("alice@a.de", detector, storeA);
    const detectorB = new RegexDetector();
    anonymizeText("bob@b.de", detectorB, storeB);

    expect(storeA.list().length).toBeGreaterThanOrEqual(1);
    expect(storeB.list().length).toBeGreaterThanOrEqual(1);
    expect(storeA.list().some((m) => m.original === "bob@b.de")).toBe(false);
    expect(storeB.list().some((m) => m.original === "alice@a.de")).toBe(false);
  });

  it("collision avoidance: different originals with same placeholder get incremented number", () => {
    const store = createSessionStore("collision-test");
    const r1 = anonymizeText("alice@a.de", detector, store);
    expect(r1.matches[0].replacement).toBe("<EMAIL_1>");

    const detector2 = new RegexDetector();
    const r2 = anonymizeText("bob@b.de", detector2, store);
    expect(r2.matches[0].replacement).not.toBe("<EMAIL_1>");
    expect(r2.matches[0].replacement).toBe("<EMAIL_2>");
  });

  it("irreversible mode uses generic labels", () => {
    const store = createSessionStore("irrev-test");
    const result = anonymizeText(
      "Mail: me@test.de, IBAN: DE89370400440532013000",
      detector,
      store,
      { mode: "irreversible_export", storeMappings: false, reversible: false },
    );
    expect(result.text).toContain("[EMAIL]");
    expect(result.text).toContain("[IBAN]");
    expect(result.text).not.toContain("<EMAIL_");
    expect(store.list().length).toBe(0);
  });

  it("irreversible: replaces PII but keeps surrounding text intact", () => {
    const store = createSessionStore("irrev-text");
    const result = anonymizeText(
      "Mail: test@example.com please contact",
      detector,
      store,
      { mode: "irreversible_export", storeMappings: false, reversible: false },
    );
    expect(result.count).toBe(1);
    expect(result.text).toBe("Mail: [EMAIL] please contact");
    expect(store.list().length).toBe(0);
  });
});
