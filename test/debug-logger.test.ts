import { describe, it, expect, beforeAll, afterAll, afterEach, spyOn } from "bun:test";
import { existsSync, readFileSync, rmSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("Debug Logger", () => {
  const originalDebug = process.env.CC_DEBUG;
  let logDebugEvent: (type: string, payload: Record<string, unknown>) => void;
  let tmpDir: string;
  let homedirSpy: ReturnType<typeof spyOn>;

  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "anon-debug-test-"));
    homedirSpy = spyOn(await import("node:os"), "homedir").mockReturnValue(tmpDir);
    const mod = await import("../src/debug-logger");
    logDebugEvent = mod.logDebugEvent;
  });

  afterAll(() => {
    homedirSpy?.mockRestore();
    if (originalDebug !== undefined) {
      process.env.CC_DEBUG = originalDebug;
    } else {
      delete process.env.CC_DEBUG;
    }
    rmSync(tmpDir, { recursive: true, force: true });
  });

  afterEach(() => {
    if (originalDebug !== undefined) {
      process.env.CC_DEBUG = originalDebug;
    } else {
      delete process.env.CC_DEBUG;
    }
  });

  it("is no-op when CC_DEBUG is not set", () => {
    delete process.env.CC_DEBUG;
    logDebugEvent("test.event", { foo: "bar" });

    const cacheDir = join(tmpDir, ".cache", "opencode", "four-opencode-anonymizer");
    expect(existsSync(cacheDir)).toBe(false);
  });

  it("writes JSONL line with correct fields when CC_DEBUG=true", () => {
    process.env.CC_DEBUG = "true";
    const testType = "test.event";
    const testPayload = { foo: "bar", num: 42 };
    logDebugEvent(testType, testPayload);

    const date = new Date().toISOString().split("T")[0];
    const logPath = join(
      tmpDir,
      ".cache",
      "opencode",
      "four-opencode-anonymizer",
      `debug-${date}.jsonl`,
    );

    expect(existsSync(logPath)).toBe(true);
    const content = readFileSync(logPath, "utf-8").trim();
    const lines = content.split("\n");
    expect(lines.length).toBeGreaterThanOrEqual(1);

    const parsed = JSON.parse(lines[0]);
    expect(parsed.type).toBe(testType);
    expect(parsed.foo).toBe("bar");
    expect(parsed.num).toBe(42);
    expect(typeof parsed.ts).toBe("number");
    expect(parsed.ts).toBeGreaterThan(0);
  });

  it("never throws even with empty payload", () => {
    process.env.CC_DEBUG = "true";
    expect(() => {
      logDebugEvent("test", {});
    }).not.toThrow();
  });
});
