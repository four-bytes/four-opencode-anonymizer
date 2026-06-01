import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { rehydrateText } from "../src/rehydrate.js";
import { createMappingStore, type MappingStore } from "../src/mapping-store.js";
import { existsSync, unlinkSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("rehydrateText", () => {
  let store: MappingStore;
  let dbPath: string;

  beforeAll(() => {
    const testDir = join(tmpdir(), "four-anon-rehydrate-" + Date.now());
    mkdirSync(testDir, { recursive: true });
    dbPath = join(testDir, "test-rehydrate.db");
    store = createMappingStore(dbPath);
  });

  afterAll(() => {
    store.close();
    try { unlinkSync(dbPath); } catch {}
    try { unlinkSync(dbPath + "-wal"); } catch {}
    try { unlinkSync(dbPath + "-shm"); } catch {}
  });

  it("replaces placeholder with original", () => {
    store.store("john@example.com", "<EMAIL_1>", "email", "s1");
    store.store("+49 170 1234567", "<PHONE_1>", "phone", "s1");

    const text = "Contact <EMAIL_1> or call <PHONE_1>";
    const result = rehydrateText(text, store);

    expect(result).toContain("john@example.com");
    expect(result).toContain("+49 170 1234567");
    expect(result).not.toContain("<EMAIL_1>");
  });

  it("leaves unknown placeholders unchanged", () => {
    const text = "Unknown <EMAIL_99> placeholder";
    const result = rehydrateText(text, store);
    expect(result).toContain("<EMAIL_99>");
  });

  it("leaves non-placeholder text unchanged", () => {
    const text = "Just a normal message with no placeholders.";
    const result = rehydrateText(text, store);
    expect(result).toBe(text);
  });

  it("handles empty string", () => {
    expect(rehydrateText("", store)).toBe("");
  });

  it("rehydrates multiple placeholders of different types", () => {
    store.store("DE89370400440532013000", "<IBAN_1>", "iban", "s2");
    store.store("alice@test.de", "<EMAIL_2>", "email", "s2");

    const text = "IBAN: <IBAN_1>, Email: <EMAIL_2>";
    const result = rehydrateText(text, store);

    expect(result).toContain("DE89370400440532013000");
    expect(result).toContain("alice@test.de");
    expect(result).not.toContain("<IBAN_1>");
    expect(result).not.toContain("<EMAIL_2>");
  });
});
