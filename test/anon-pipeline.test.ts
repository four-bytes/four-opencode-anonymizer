import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { anonymizeText } from "../src/anon-pipeline.js";
import { RegexDetector } from "../src/detectors/regex.js";
import { createMappingStore, type MappingStore } from "../src/mapping-store.js";
import { existsSync, unlinkSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("anonymizeText", () => {
  let store: MappingStore;
  let detector: RegexDetector;
  let dbPath: string;

  beforeAll(() => {
    const testDir = join(tmpdir(), "four-anon-pipeline-" + Date.now());
    mkdirSync(testDir, { recursive: true });
    dbPath = join(testDir, "test-pipeline.db");
    store = createMappingStore(dbPath);
    detector = new RegexDetector();
  });

  afterAll(() => {
    store.close();
    try { unlinkSync(dbPath); } catch {}
    try { unlinkSync(dbPath + "-wal"); } catch {}
    try { unlinkSync(dbPath + "-shm"); } catch {}
  });

  it("anonymizes email in text", () => {
    const result = anonymizeText(
      "Contact alice@example.com for help",
      "session-1",
      detector,
      store,
    );
    expect(result.count).toBeGreaterThanOrEqual(1);
    expect(result.text).not.toContain("alice@example.com");
    expect(result.text).toContain("<EMAIL_");
  });

  it("stores mapping and can retrieve original", () => {
    const result = anonymizeText(
      "Email: bob@test.de",
      "session-2",
      detector,
      store,
    );
    const emailMatch = result.matches.find((m) => m.type === "email");
    expect(emailMatch).toBeDefined();

    const original = store.getOriginal(emailMatch!.replacement);
    expect(original).toBe("bob@test.de");
  });

  it("anonymizes multiple PII types in one text", () => {
    const text = "Mail: me@test.de, IBAN: DE89370400440532013000, Tel: +49 170 1234567";
    const result = anonymizeText(text, "session-3", detector, store);

    expect(result.count).toBeGreaterThanOrEqual(3);
    expect(result.text).not.toContain("me@test.de");
    expect(result.text).not.toContain("DE89370400440532013000");
    expect(result.text).not.toContain("+49 170 1234567");
    expect(result.text).toContain("<EMAIL_");
    expect(result.text).toContain("<IBAN_");
    expect(result.text).toContain("<PHONE_");
  });

  it("returns unchanged text when no PII found", () => {
    const text = "Just a normal sentence with no personal data.";
    const result = anonymizeText(text, "session-4", detector, store);
    expect(result.count).toBe(0);
    expect(result.text).toBe(text);
  });

  it("handles empty string", () => {
    const result = anonymizeText("", "session-5", detector, store);
    expect(result.count).toBe(0);
    expect(result.text).toBe("");
  });

  it("session isolation: only lists own mappings", () => {
    anonymizeText("alice@a.de", "session-a", detector, store);
    anonymizeText("bob@b.de", "session-b", detector, store);

    const listA = store.listBySession("session-a");
    const listB = store.listBySession("session-b");

    expect(listA.length).toBeGreaterThanOrEqual(1);
    expect(listB.length).toBeGreaterThanOrEqual(1);
    // session-a should NOT see session-b's email
    expect(listA.some((m) => m.placeholder === listB[0]?.placeholder)).toBe(false);
  });
});
