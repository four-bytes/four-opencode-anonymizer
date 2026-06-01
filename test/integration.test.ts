import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { RegexDetector } from "../src/detectors/regex.js";
import { anonymizeText } from "../src/anon-pipeline.js";
import { rehydrateText } from "../src/rehydrate.js";
import { createMappingStore, type MappingStore } from "../src/mapping-store.js";
import { getModeConfig, type ModeConfig } from "../src/modes.js";
import { existsSync, unlinkSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("End-to-End Pipeline", () => {
  let store: MappingStore;
  let detector: RegexDetector;
  let dbPath: string;

  beforeAll(() => {
    const testDir = join(tmpdir(), "four-anon-e2e-" + Date.now());
    mkdirSync(testDir, { recursive: true });
    dbPath = join(testDir, "test-e2e.db");
    store = createMappingStore(dbPath);
    detector = new RegexDetector();
  });

  afterAll(() => {
    store.close();
    try { unlinkSync(dbPath); } catch {}
    try { unlinkSync(dbPath + "-wal"); } catch {}
    try { unlinkSync(dbPath + "-shm"); } catch {}
  });

  it("roundtrip: anonymize → rehydrate (redact_for_llm)", () => {
    const mode: ModeConfig = { mode: "redact_for_llm", storeMappings: true, reversible: true };
    const original = "Kontakt: max.mustermann@firma.de, Tel: +49 170 1234567";

    // Step 1: Anonymize
    const anon = anonymizeText(original, "e2e-1", detector, store, mode);
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

    const anon = anonymizeText(original, "e2e-2", detector, store, mode);
    expect(anon.text).toContain("[EMAIL]");
    expect(anon.text).toContain("[IBAN]");

    // Rehydration should NOT restore (generic placeholders)
    const llmResponse = `Daten: ${anon.text}`;
    const restored = rehydrateText(llmResponse, store);
    expect(restored).toContain("[EMAIL]");
    expect(restored).not.toContain("test@example.com");
  });

  it("session isolation: different sessions have separate mappings", () => {
    const mode: ModeConfig = { mode: "redact_for_llm", storeMappings: true, reversible: true };
    
    anonymizeText("alice@a.de", "session-a", detector, store, mode);
    anonymizeText("bob@b.de", "session-b", detector, store, mode);

    // Both sessions should have their own mappings
    const listA = store.listBySession("session-a");
    const listB = store.listBySession("session-b");

    expect(listA.length).toBeGreaterThanOrEqual(1);
    expect(listB.length).toBeGreaterThanOrEqual(1);
    
    // Mappings should not cross sessions
    const placeholdersA = new Set(listA.map((m) => m.placeholder));
    const placeholdersB = new Set(listB.map((m) => m.placeholder));
    expect([...placeholdersA].some((p) => placeholdersB.has(p))).toBe(false);
  });
});
