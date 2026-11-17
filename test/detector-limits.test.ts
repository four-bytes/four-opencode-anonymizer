import { describe, it, expect } from "bun:test";
import { RegexDetector } from "../src/detectors/regex.js";
import { FourAnonymizerPlugin } from "../src/four-opencode-anonymizer.js";

/**
 * Documents what the current detectors do NOT catch. These are limits, not
 * regressions: the tests pin the known-miss behaviour so a future detector
 * improvement shows up as an intentional test change.
 */

async function pluginChat(parts: Array<{ type: string; text?: string }>) {
  const mockCtx = {
    client: { app: { log: () => Promise.resolve() } },
    directory: "/tmp/test",
  } as any;
  const plugin = await FourAnonymizerPlugin(mockCtx);
  const output: any = { parts: JSON.parse(JSON.stringify(parts)), message: { role: "user" } };
  await plugin["chat.message"]!({ sessionID: "limits" } as any, output as any);
  return output.parts;
}

describe("detector limits (documented known misses)", () => {
  it("misses German landline numbers (only mobile 15/16/17 prefixes)", () => {
    const detector = new RegexDetector();
    expect(detector.detect("Tel: 030 12345678")).toHaveLength(0);
  });

  it("misses non-German phone numbers", () => {
    const detector = new RegexDetector();
    expect(detector.detect("Call +1 415 555 0123")).toHaveLength(0);
  });

  it("misses lowercase IBANs", () => {
    const detector = new RegexDetector();
    expect(detector.detect("iban de89370400440532013000")).toHaveLength(0);
  });

  it("misses tax IDs without a keyword", () => {
    const detector = new RegexDetector();
    expect(detector.detect("12 345 678 901")).toHaveLength(0);
  });

  it("misses API keys without sk_/api_/key_ prefix (e.g. AWS AKIA…)", () => {
    const detector = new RegexDetector();
    expect(detector.detect("AKIAIOSFODNN7EXAMPLE")).toHaveLength(0);
  });

  it("misses spaced-out or obfuscated email addresses", () => {
    const detector = new RegexDetector();
    expect(detector.detect("alice @ example . com")).toHaveLength(0);
    expect(detector.detect("alice[at]example[dot]com")).toHaveLength(0);
  });

  it("misses PII split across message parts", async () => {
    const parts = await pluginChat([
      { type: "text", text: "alice@" },
      { type: "text", text: "example.com" },
    ]);
    expect(parts[0].text).toBe("alice@");
    expect(parts[1].text).toBe("example.com");
  });

  it("does not run the NER detector in the plugin (names/cities pass through)", async () => {
    const parts = await pluginChat([{ type: "text", text: "Herr Müller wohnt in Berlin." }]);
    expect(parts[0].text).toBe("Herr Müller wohnt in Berlin.");
  });

  it("cannot scan binary attachments (PDF/image file parts are untouched)", async () => {
    const pdfPart = {
      type: "file",
      mime: "application/pdf",
      url: "data:application/pdf;base64,SGVsbG8=",
    };
    const parts = await pluginChat([pdfPart as any]);
    expect(parts[0]).toEqual(pdfPart);
  });

  it("relies on opencode to expand text/plain attachments into text parts", async () => {
    // opencode does this before chat.message (prompt.ts:771-780); the plugin
    // only sees the expanded text part, which is covered by the normal scan.
    const parts = await pluginChat([{ type: "text", text: "alice@file.example" }]);
    expect(parts[0].text).not.toContain("alice@file.example");
  });
});
