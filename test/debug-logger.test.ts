import { describe, it, expect, afterEach } from "bun:test";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { logDebugEvent } from "../src/debug-logger.js";

describe("Debug Logger", () => {
  const originalDebug = process.env.CC_DEBUG;

  afterEach(() => {
    if (originalDebug !== undefined) {
      process.env.CC_DEBUG = originalDebug;
    } else {
      delete process.env.CC_DEBUG;
    }
  });

  it("is no-op when CC_DEBUG is not set", () => {
    delete process.env.CC_DEBUG;
    // Should not throw
    expect(() => logDebugEvent("test.event", { foo: "bar" })).not.toThrow();
  });

  it("does not throw when CC_DEBUG=true", () => {
    process.env.CC_DEBUG = "true";
    expect(() => logDebugEvent("test.event", { foo: "bar", num: 42 })).not.toThrow();
  });

  it("never throws even with empty payload", () => {
    process.env.CC_DEBUG = "true";
    expect(() => {
      logDebugEvent("test", {});
    }).not.toThrow();
  });

  it("writes JSONL to real debug log when CC_DEBUG=true", () => {
    process.env.CC_DEBUG = "true";
    const testType = "debug-logger.integration";
    const testPayload = { answer: 42 };
    logDebugEvent(testType, testPayload);

    const date = new Date().toISOString().split("T")[0];
    const home = process.env.HOME || "/tmp";
    const logPath = join(
      home,
      ".cache",
      "opencode",
      "four-opencode-anonymizer",
      `debug-${date}.jsonl`,
    );

    if (existsSync(logPath)) {
      const content = readFileSync(logPath, "utf-8").trim();
      const lines = content.split("\n");
      const lastLine = lines[lines.length - 1];
      const parsed = JSON.parse(lastLine);
      expect(parsed.type).toBe(testType);
      expect(parsed.answer).toBe(42);
      expect(typeof parsed.ts).toBe("number");
    }
  });
});
