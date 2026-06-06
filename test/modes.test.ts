import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { getMode, getModeConfig, type AnonymizeMode } from "../src/modes.js";

describe("modes", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.FOUR_ANON_MODE;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.FOUR_ANON_MODE;
    } else {
      process.env.FOUR_ANON_MODE = originalEnv;
    }
  });

  describe("getMode", () => {
    it("defaults to redact_for_llm when env is unset", () => {
      delete process.env.FOUR_ANON_MODE;
      expect(getMode()).toBe("redact_for_llm");
    });

    it("defaults to redact_for_llm when env is empty string", () => {
      process.env.FOUR_ANON_MODE = "";
      expect(getMode()).toBe("redact_for_llm");
    });

    it("returns redact_for_llm for explicit env", () => {
      process.env.FOUR_ANON_MODE = "redact_for_llm";
      expect(getMode()).toBe("redact_for_llm");
    });

    it("returns redact_for_logs", () => {
      process.env.FOUR_ANON_MODE = "redact_for_logs";
      expect(getMode()).toBe("redact_for_logs");
    });

    it("returns redact_for_memory", () => {
      process.env.FOUR_ANON_MODE = "redact_for_memory";
      expect(getMode()).toBe("redact_for_memory");
    });

    it("returns irreversible_export", () => {
      process.env.FOUR_ANON_MODE = "irreversible_export";
      expect(getMode()).toBe("irreversible_export");
    });

    it("is case-insensitive", () => {
      process.env.FOUR_ANON_MODE = "REDACT_FOR_LOGS";
      expect(getMode()).toBe("redact_for_logs");
    });

    it("falls back to default for unknown mode", () => {
      process.env.FOUR_ANON_MODE = "bogus_mode";
      expect(getMode()).toBe("redact_for_llm");
    });
  });

  describe("getModeConfig", () => {
    it("redact_for_llm is reversible with storeMappings", () => {
      process.env.FOUR_ANON_MODE = "redact_for_llm";
      const config = getModeConfig();
      expect(config.mode).toBe("redact_for_llm");
      expect(config.reversible).toBe(true);
      expect(config.storeMappings).toBe(true);
    });

    it("irreversible_export is NOT reversible and does NOT store mappings", () => {
      process.env.FOUR_ANON_MODE = "irreversible_export";
      const config = getModeConfig();
      expect(config.mode).toBe("irreversible_export");
      expect(config.reversible).toBe(false);
      expect(config.storeMappings).toBe(false);
    });

    it("all 4 modes have consistent configs", () => {
      const modes: AnonymizeMode[] = [
        "redact_for_llm",
        "redact_for_logs",
        "redact_for_memory",
        "irreversible_export",
      ];
      for (const mode of modes) {
        process.env.FOUR_ANON_MODE = mode;
        const config = getModeConfig();
        expect(config.mode).toBe(mode);
        if (mode === "irreversible_export") {
          expect(config.reversible).toBe(false);
          expect(config.storeMappings).toBe(false);
        } else {
          expect(config.reversible).toBe(true);
          expect(config.storeMappings).toBe(true);
        }
      }
    });
  });
});
