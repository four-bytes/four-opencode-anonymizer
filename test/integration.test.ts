import { describe, it, expect } from "bun:test";
import { RegexDetector } from "../src/detectors/regex.js";
import { anonymizeText } from "../src/anon-pipeline.js";
import { rehydrateText } from "../src/rehydrate.js";
import { createSessionStore } from "../src/session-store.js";
import { type ModeConfig } from "../src/modes.js";

describe("End-to-End Pipeline", () => {
  it("roundtrip: anonymize → rehydrate (redact_for_llm)", () => {
    const mode: ModeConfig = { mode: "redact_for_llm", storeMappings: true, reversible: true };
    const original = "Kontakt: max.mustermann@firma.de, Tel: +49 170 1234567";
    const detector = new RegexDetector();
    const store = createSessionStore("e2e-1");

    // Step 1: Anonymize
    const anon = anonymizeText(original, detector, store, mode);
    expect(anon.text).not.toContain("max.mustermann@firma.de");
    expect(anon.text).not.toContain("+49 170 1234567");

    // Step 2: Simulate LLM response (placeholders kept)
    const llmResponse = `Ihre Daten: ${anon.text} — wir melden uns.`;

    // Step 3: Rehydrate
    const restored = rehydrateText(llmResponse, store);
    expect(restored).toContain("max.mustermann@firma.de");
    expect(restored).toContain("+49 170 1234567");
    expect(restored).not.toContain("<EMAIL_");
    expect(restored).not.toContain("<PHONE_");
  });

  it("irreversible_export: no rehydration possible", () => {
    const mode: ModeConfig = { mode: "irreversible_export", storeMappings: false, reversible: false };
    const original = "Email: test@example.com, IBAN: DE89370400440532013000";
    const detector = new RegexDetector();
    const store = createSessionStore("e2e-2");

    const anon = anonymizeText(original, detector, store, mode);
    expect(anon.text).toContain("[EMAIL]");
    expect(anon.text).toContain("[IBAN]");

    // Rehydration should NOT restore (generic placeholders)
    const llmResponse = `Daten: ${anon.text}`;
    const restored = rehydrateText(llmResponse, store);
    expect(restored).toContain("[EMAIL]");
    expect(restored).not.toContain("test@example.com");
  });

  it("session isolation: sessions cannot see each other's data", () => {
    const mode: ModeConfig = { mode: "redact_for_llm", storeMappings: true, reversible: true };
    
    const detectorA = new RegexDetector();
    const storeA = createSessionStore("session-a");
    const detectorB = new RegexDetector();
    const storeB = createSessionStore("session-b");

    anonymizeText("alice@a.de", detectorA, storeA, mode);
    anonymizeText("bob@b.de", detectorB, storeB, mode);

    const listA = storeA.list();
    const listB = storeB.list();

    expect(listA.length).toBeGreaterThanOrEqual(1);
    expect(listB.length).toBeGreaterThanOrEqual(1);
    
    // Mappings should not cross sessions
    const originalsA = new Set(listA.map((m) => m.original));
    const originalsB = new Set(listB.map((m) => m.original));
    expect([...originalsA].some((o) => originalsB.has(o))).toBe(false);
  });

  it("roundtrip with new PII types: credit card, bank account, reference", () => {
    const mode: ModeConfig = { mode: "redact_for_llm", storeMappings: true, reversible: true };
    const original = "Kontonummer: 1234567890, Referenz: ABC-12345, Karte: 4111111111111111";
    const detector = new RegexDetector();
    const store = createSessionStore("e2e-new-types");

    const anon = anonymizeText(original, detector, store, mode);
    expect(anon.text).not.toContain("1234567890");
    expect(anon.text).not.toContain("ABC-12345");
    expect(anon.text).not.toContain("4111111111111111");
    expect(anon.text).toContain("<BANK_ACCOUNT_");
    expect(anon.text).toContain("<REFERENCE_");
    expect(anon.text).toContain("<CREDIT_CARD_");

    const llmResponse = `Verarbeite: ${anon.text}`;
    const restored = rehydrateText(llmResponse, store);
    expect(restored).toContain("1234567890");
    expect(restored).toContain("ABC-12345");
    expect(restored).toContain("4111111111111111");
  });

  it("no bleed: session B cannot rehydrate session A's placeholders", () => {
    const mode: ModeConfig = { mode: "redact_for_llm", storeMappings: true, reversible: true };
    
    // Session A: stores alice@secret.de
    const detectorA = new RegexDetector();
    const storeA = createSessionStore("session-a");
    const resultA = anonymizeText("alice@secret.de", detectorA, storeA, mode);
    const placeholderA = resultA.matches[0].replacement;

    // Session B: independent store, has NO mapping for session A's placeholder
    const storeB = createSessionStore("session-b");
    const llmResponse = `Reply using ${placeholderA}`;
    const rehydratedB = rehydrateText(llmResponse, storeB);

    // Session B should NOT see session A's email
    expect(rehydratedB).not.toContain("alice@secret.de");
    expect(rehydratedB).toContain(placeholderA); // Placeholder left as-is
  });
});
