import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { anonymizeText } from "../src/anon-pipeline.js";
import { RegexDetector } from "../src/detectors/regex.js";
import { createMappingStore, type MappingStore } from "../src/mapping-store.js";
import { getMode, getModeConfig, type ModeConfig } from "../src/modes.js";
import { existsSync, unlinkSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("4 Modi", () => {
  let store: MappingStore;
  let detector: RegexDetector;
  let dbPath: string;

  beforeAll(() => {
    const testDir = join(tmpdir(), "four-anon-modes-" + Date.now());
    mkdirSync(testDir, { recursive: true });
    dbPath = join(testDir, "test-modes.db");
    store = createMappingStore(dbPath);
    detector = new RegexDetector();
  });

  afterAll(() => {
    store.close();
    try { unlinkSync(dbPath); } catch {}
    try { unlinkSync(dbPath + "-wal"); } catch {}
    try { unlinkSync(dbPath + "-shm"); } catch {}
  });

  afterEach(() => {
    // Clean up mappings between mode tests
    store.clearSession("session-llm");
    store.clearSession("session-logs");
    store.clearSession("session-mem");
    store.clearSession("session-irr");
  });

  it("redact_for_llm: reversible placeholders + stored mappings", () => {
    const mode: ModeConfig = { mode: "redact_for_llm", storeMappings: true, reversible: true };
    const result = anonymizeText("alice@test.de", "session-llm", detector, store, mode);

    expect(result.text).toContain("<EMAIL_");
    expect(result.text).not.toContain("alice@test.de");

    const emailMatch = result.matches.find((m) => m.type === "email");
    expect(store.getOriginal(emailMatch!.replacement)).toBe("alice@test.de");
  });

  it("redact_for_logs: reversible placeholders + stored mappings", () => {
    const mode: ModeConfig = { mode: "redact_for_logs", storeMappings: true, reversible: true };
    const result = anonymizeText("bob@test.de", "session-logs", detector, store, mode);

    expect(result.text).toContain("<EMAIL_");
    const emailMatch = result.matches.find((m) => m.type === "email");
    expect(store.getOriginal(emailMatch!.replacement)).toBe("bob@test.de");
  });

  it("redact_for_memory: reversible placeholders + stored mappings", () => {
    const mode: ModeConfig = { mode: "redact_for_memory", storeMappings: true, reversible: true };
    const result = anonymizeText("carol@test.de", "session-mem", detector, store, mode);

    expect(result.text).toContain("<EMAIL_");
    const emailMatch = result.matches.find((m) => m.type === "email");
    expect(store.getOriginal(emailMatch!.replacement)).toBe("carol@test.de");
  });

  it("irreversible_export: generic placeholders, NO stored mappings", () => {
    const mode: ModeConfig = { mode: "irreversible_export", storeMappings: false, reversible: false };
    const result = anonymizeText("dave@test.de", "session-irr", detector, store, mode);

    expect(result.text).toContain("[EMAIL]");
    expect(result.text).not.toContain("dave@test.de");
    expect(result.text).not.toContain("<EMAIL_");

    // NO mapping stored
    const list = store.listBySession("session-irr");
    expect(list.length).toBe(0);
  });

  it("irreversible_export handles multiple PII types", () => {
    const mode: ModeConfig = { mode: "irreversible_export", storeMappings: false, reversible: false };
    const text = "eve@test.de, IBAN: DE89370400440532013000, Tel: +49 170 1234567";
    const result = anonymizeText(text, "session-irr-2", detector, store, mode);

    expect(result.text).toContain("[EMAIL]");
    expect(result.text).toContain("[IBAN]");
    expect(result.text).toContain("[PHONE]");
    expect(result.count).toBeGreaterThanOrEqual(3);
  });

  it("getMode defaults to redact_for_llm", () => {
    delete process.env.FOUR_ANON_MODE;
    expect(getMode()).toBe("redact_for_llm");
  });
});
