import { describe, it, expect } from "bun:test";
import type { ModeConfig } from "../src/modes.js";
import { FourAnonymizerPlugin } from "../src/four-opencode-anonymizer.js";
import { anonymizeValue } from "../src/model-bound.js";
import { RegexDetector } from "../src/detectors/regex.js";
import { getModeConfig } from "../src/modes.js";
import { createSessionStore } from "../src/session-store.js";
import { rehydrateForDisplay } from "../src/rehydrate.js";

/**
 * Synthetic multi-turn test for the model-bound path map.
 *
 * It simulates the opencode lifecycle for two turns:
 *   1. user message → chat.message → persisted parts
 *   2. assistant text → experimental.text.complete → persisted part
 *   3. tool result → tool.execute.after → persisted tool part
 *   4. next request → experimental.chat.messages.transform + system.transform
 *      → the payload the provider would receive
 *
 * The assertion is on the serialized payload, not on individual hooks: no
 * original PII may appear anywhere the model can read it.
 */

const USER_EMAIL = "alice@customer.de";
const USER_PHONE = "+49 170 1234567";
const FILE_EMAIL = "carol@supplier.de";
const ECHO_EMAIL = "dave@echo.example";
const SYSTEM_EMAIL = "ops@internal.example";

async function createPlugin() {
  const mockCtx = {
    client: { app: { log: () => Promise.resolve() } },
    directory: "/tmp/test",
  } as any;
  const plugin = await FourAnonymizerPlugin(mockCtx);

  return {
    async chat(sessionID: string, parts: Array<{ type: string; text: string }>) {
      const output: any = { parts: JSON.parse(JSON.stringify(parts)), message: { role: "user" } };
      await plugin["chat.message"]!({ sessionID } as any, output as any);
      return output.parts;
    },
    async textComplete(sessionID: string, text: string) {
      const output = { text };
      await plugin["experimental.text.complete"]!(
        { sessionID, messageID: "m", partID: "p" } as any,
        output as any,
      );
      return output.text;
    },
    async toolAfter(sessionID: string, outputText: string) {
      const output: any = { title: "read", output: outputText, metadata: {} };
      await plugin["tool.execute.after"]!(
        { tool: "read", sessionID, callID: "c", args: {} } as any,
        output,
      );
      return output.output;
    },
    async buildRequest(messages: any[], system: string[]) {
      const messagesOutput = { messages };
      await plugin["experimental.chat.messages.transform"]!({} as any, messagesOutput as any);
      const systemOutput = { system: [...system] };
      await plugin["experimental.chat.system.transform"]!(
        { sessionID: "synthetic", model: {} } as any,
        systemOutput as any,
      );
      return { system: systemOutput.system, messages: messagesOutput.messages };
    },
  };
}

describe("model-bound paths — synthetic multi-turn", () => {
  it("keeps every original out of the provider payload across two turns", async () => {
    const { chat, textComplete, toolAfter, buildRequest } = await createPlugin();

    // ── Turn 1: user text + attached text/plain file (already expanded by opencode) ──
    const userParts = await chat("synthetic", [
      { type: "text", text: `Bitte kontaktieren: ${USER_EMAIL}, Tel ${USER_PHONE}` },
      { type: "text", text: `Dateiinhalt: ${FILE_EMAIL}` },
    ]);

    // Earlier hooks must already have removed originals from persisted content.
    const persistedUser = JSON.stringify(userParts);
    expect(persistedUser).not.toContain(USER_EMAIL);
    expect(persistedUser).not.toContain(USER_PHONE);
    expect(persistedUser).not.toContain(FILE_EMAIL);

    // ── Assistant text: one placeholder reply, one echo of a raw address ──
    const assistantReply = await textComplete("synthetic", "Ich habe <EMAIL_1> notiert.");
    const assistantEcho = await textComplete("synthetic", `Weiter an ${ECHO_EMAIL}`);
    expect(assistantReply).toContain("<EMAIL_1>");
    expect(assistantEcho).not.toContain(ECHO_EMAIL);

    // ── Tool result: model-bound output and model-bound input ──
    const toolOutput = await toolAfter("synthetic", `Supplier: ${FILE_EMAIL}`);
    expect(toolOutput).not.toContain(FILE_EMAIL);

    const assistantParts = [
      { type: "text", text: assistantReply },
      { type: "text", text: assistantEcho },
      {
        type: "tool",
        state: {
          status: "completed",
          input: { recipient: FILE_EMAIL },
          output: toolOutput,
        },
      },
    ];

    // ── Turn 2: user follows up, then opencode assembles the next request ──
    const followUp = await chat("synthetic", [{ type: "text", text: "Danke, weiter." }]);

    const payload = await buildRequest(
      [
        { info: { sessionID: "synthetic", role: "user" }, parts: userParts },
        { info: { sessionID: "synthetic", role: "assistant" }, parts: assistantParts },
        { info: { sessionID: "synthetic", role: "user" }, parts: followUp },
      ],
      [`Project owner: ${SYSTEM_EMAIL}`, "No PII here"],
    );

    const serialized = JSON.stringify(payload);
    for (const original of [USER_EMAIL, USER_PHONE, FILE_EMAIL, ECHO_EMAIL, SYSTEM_EMAIL]) {
      expect(serialized).not.toContain(original);
    }
    expect(serialized).toContain("<EMAIL_");
    expect(serialized).toContain("<PHONE_");
    expect(payload.system[1]).toBe("No PII here");
  });

  it("display rehydration is separate and never writes back into the payload", async () => {
    const { chat, textComplete, buildRequest } = await createPlugin();

    await chat("synthetic-display", [{ type: "text", text: USER_EMAIL }]);
    const persistedAssistant = await textComplete("synthetic-display", "Kontakt: <EMAIL_1>");

    // A display layer may rehydrate for rendering. Reconstruct the same mapping
    // the session store holds (email → <EMAIL_1>) to exercise the display path.
    const displayStore = createSessionStore("synthetic-display");
    displayStore.store(USER_EMAIL, "<EMAIL_1>", "email");
    const displayText = rehydrateForDisplay(persistedAssistant, displayStore);
    expect(displayText).toContain(USER_EMAIL);

    // The model-bound payload is built from persisted parts, not from display text.
    const payload = await buildRequest(
      [
        {
          info: { sessionID: "synthetic-display", role: "assistant" },
          parts: [{ type: "text", text: persistedAssistant }],
        },
      ],
      [],
    );
    expect(JSON.stringify(payload)).not.toContain(USER_EMAIL);
    expect(JSON.stringify(payload)).toContain("<EMAIL_1>");
  });

  it("closes the leak even if a regression writes originals into history", async () => {
    const { buildRequest } = await createPlugin();

    const leakyHistory = [
      {
        info: { sessionID: "synthetic-leak", role: "user" },
        parts: [{ type: "text", text: USER_EMAIL }],
      },
      {
        info: { sessionID: "synthetic-leak", role: "assistant" },
        parts: [
          { type: "reasoning", text: `User is ${USER_EMAIL}` },
          {
            type: "tool",
            state: {
              status: "error",
              input: { to: USER_EMAIL },
              error: `failed for ${USER_EMAIL}`,
              metadata: { output: USER_EMAIL },
            },
          },
        ],
      },
    ];

    const payload = await buildRequest(leakyHistory, [`Owner: ${USER_EMAIL}`]);
    expect(JSON.stringify(payload)).not.toContain(USER_EMAIL);
  });

  it("does not rehydrate placeholders in the model transform", async () => {
    const { chat, buildRequest } = await createPlugin();
    await chat("synthetic-placeholder", [{ type: "text", text: USER_EMAIL }]);

    const payload = await buildRequest(
      [
        {
          info: { sessionID: "synthetic-placeholder", role: "assistant" },
          parts: [{ type: "text", text: "Contact <EMAIL_1>" }],
        },
      ],
      [],
    );
    expect(JSON.stringify(payload)).toContain("<EMAIL_1>");
    expect(JSON.stringify(payload)).not.toContain(USER_EMAIL);
  });
});
describe("anonymizeValue — object keys are model-bound", () => {
  // Built at runtime so this file contains no literal address.
  const local = (...parts: string[]) => parts.join("@");

  const irreversible: ModeConfig = {
    mode: "irreversible_export",
    storeMappings: false,
    reversible: false,
  };

  it("anonymizes keys, not just values", () => {
    const detector = new RegexDetector();
    const store = createSessionStore("keys-reversible");
    const email = local("key-alpha", "example.com");
    const input = { [email]: "contact", name: "Hans" };

    const result = anonymizeValue(input, detector, store, getModeConfig());
    const serialized = JSON.stringify(result.value);

    expect(serialized).not.toContain(email);
    expect(serialized).toContain("<EMAIL_1>");
    expect(serialized).toContain("contact");
    expect(serialized).toContain("Hans");
  });

  it("keeps colliding keys distinct with a suffix", () => {
    const detector = new RegexDetector();
    const store = createSessionStore("keys-collision");
    const emailA = local("key-beta", "example.com");
    const emailB = local("key-gamma", "example.com");
    const input: Record<string, number> = { [emailA]: 1, [emailB]: 2, plain: 3 };

    const result = anonymizeValue(input, detector, store, irreversible);
    const next = result.value as Record<string, unknown>;
    const keys = Object.keys(next);

    // Both addresses map to the same generic label in irreversible mode.
    expect(keys).toContain("[EMAIL]");
    expect(keys).toContain("[EMAIL]_2");
    expect(keys).toContain("plain");
    expect(keys).toHaveLength(3);
    expect(next["[EMAIL]"]).toBe(1);
    expect(next["[EMAIL]_2"]).toBe(2);
    expect(JSON.stringify(next)).not.toContain(emailA);
    expect(JSON.stringify(next)).not.toContain(emailB);
  });

  it("keeps __proto__ and constructor as own keys", () => {
    const detector = new RegexDetector();
    const store = createSessionStore("keys-special");
    const input: Record<string, unknown> = { ["__proto__"]: { foo: "bar" }, constructor: "c" };

    const result = anonymizeValue(input, detector, store, getModeConfig());
    const next = result.value as Record<string, unknown>;

    expect(Object.keys(next)).toEqual(["__proto__", "constructor"]);
    expect(Object.getPrototypeOf(next)).toBe(Object.prototype);
    expect(Object.getOwnPropertyDescriptor(next, "__proto__")?.value).toEqual({ foo: "bar" });
    expect(JSON.stringify(next)).toBe('{"__proto__":{"foo":"bar"},"constructor":"c"}');
  });
});
