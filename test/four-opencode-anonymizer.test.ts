import { describe, it, expect } from "bun:test";
import { FourAnonymizerPlugin } from "../src/four-opencode-anonymizer.js";

/** Helper: create plugin and return it + a hook invoker that shares state */
async function createPlugin() {
  const mockCtx = {
    client: {
      app: {
        log: () => Promise.resolve(),
      },
    },
    directory: "/tmp/test",
  } as any;
  const plugin = await FourAnonymizerPlugin(mockCtx);
  return {
    plugin,
    /** Invoke chat.message hook (user messages only — anonymize) */
    async invokeChat(
      input: { sessionID?: string },
      parts: Array<{ type: string; text?: string }>,
    ) {
      const output: any = {
        parts: JSON.parse(JSON.stringify(parts)),
        message: { role: "user" },
      };
      await plugin["chat.message"]!(input as any, output as any);
      return output;
    },
    /** Invoke experimental.text.complete hook (rehydrate assistant output) */
    async invokeRehydrate(sessionID: string, text: string) {
      const output = { text };
      const input = { sessionID, messageID: "msg-1", partID: "part-1" };
      await plugin["experimental.text.complete"]!(input as any, output as any);
      return output;
    },
  };
}

describe("FourAnonymizerPlugin (chat.message hook)", () => {
  // ── User messages (anonymize) ──────────────────────────
  it("anonymizes PII in user message text parts", async () => {
    const { invokeChat } = await createPlugin();
    const output = await invokeChat(
      { sessionID: "s1" },
      [{ type: "text", text: "Email: alice@example.com" }],
    );
    expect(output.parts[0].text).not.toContain("alice@example.com");
    expect(output.parts[0].text).toContain("<EMAIL_");
  });

  it("rehydrates placeholders via experimental.text.complete", async () => {
    const { invokeChat, invokeRehydrate } = await createPlugin();

    // Step 1: anonymize user message (populates session store)
    await invokeChat(
      { sessionID: "s-hyd" },
      [{ type: "text", text: "Email: bob@test.de" }],
    );

    // Step 2: rehydrate assistant output via text.complete
    const result = await invokeRehydrate("s-hyd", "Ihre E-Mail <EMAIL_1> wurde verarbeitet.");
    expect(result.text).toContain("bob@test.de");
    expect(result.text).not.toContain("<EMAIL_1>");
  });

  it("text.complete leaves text unchanged when no session store exists", async () => {
    const { invokeRehydrate } = await createPlugin();
    const result = await invokeRehydrate("no-store", "Hello, how can I help?");
    expect(result.text).toBe("Hello, how can I help?");
  });



  it("handles missing parts gracefully", async () => {
    const { invokeChat } = await createPlugin();
    const output = await invokeChat(
      { sessionID: "s1" },
      [],
    );
    expect(output.parts).toEqual([]);
  });

  it("handles parts with no text field", async () => {
    const { invokeChat } = await createPlugin();
    const output = await invokeChat(
      { sessionID: "s1" },
      [{ type: "image" } as any],
    );
    expect(output.parts[0].text).toBeUndefined();
  });

  it("handles text without PII unchanged in user message", async () => {
    const { invokeChat } = await createPlugin();
    const output = await invokeChat(
      { sessionID: "s1" },
      [{ type: "text", text: "Just a normal sentence." }],
    );
    expect(output.parts[0].text).toBe("Just a normal sentence.");
  });

  // ── Session isolation ──────────────────────────────────
  it("session A cannot rehydrate session B placeholders", async () => {
    const { invokeChat, invokeRehydrate } = await createPlugin();

    // Session A: anonymize alice
    await invokeChat(
      { sessionID: "session-A" },
      [{ type: "text", text: "alice@secret.de" }],
    );

    // Session B: anonymize bob
    await invokeChat(
      { sessionID: "session-B" },
      [{ type: "text", text: "bob@public.de" }],
    );

    // Session B rehydrate: <EMAIL_1> should map to bob@public.de
    const resultB = await invokeRehydrate("session-B", "Ref: <EMAIL_1>");
    expect(resultB.text).toContain("bob@public.de");
    expect(resultB.text).not.toContain("alice@secret.de");
  });

  it("cross-session bleed: Session B cannot access Session A mappings", async () => {
    const { invokeChat, invokeRehydrate } = await createPlugin();

    // Session A stores alice@secret.de → <EMAIL_1>
    await invokeChat(
      { sessionID: "session-A" },
      [{ type: "text", text: "alice@secret.de" }],
    );

    // Session B has NO user message → NO mappings
    // rehydrate in Session B with <EMAIL_1> should leave it unchanged
    const resultB = await invokeRehydrate("session-B", "<EMAIL_1> should stay");
    expect(resultB.text).toBe("<EMAIL_1> should stay");
  });

  it("default sessionId 'unknown' when no sessionID provided", async () => {
    const { invokeChat } = await createPlugin();
    const output = await invokeChat(
      {},
      [{ type: "text", text: "test@example.com" }],
    );
    expect(output.parts[0].text).not.toContain("test@example.com");
    expect(output.parts[0].text).toContain("<EMAIL_");
  });

  // ── Edge cases ─────────────────────────────────────────
  it("rehydrate: unknown placeholders left unchanged", async () => {
    const { invokeChat, invokeRehydrate } = await createPlugin();

    // Store one email
    await invokeChat(
      { sessionID: "s-edge" },
      [{ type: "text", text: "real@test.de" }],
    );

    // Rehydrate with a placeholder that was never stored
    const result = await invokeRehydrate("s-edge", "Unknown <EMAIL_99> in text");
    expect(result.text).toContain("<EMAIL_99>");
    expect(result.text).not.toContain("real@test.de");
  });

  it("empty user message text is handled", async () => {
    const { invokeChat } = await createPlugin();
    const output = await invokeChat(
      { sessionID: "s1" },
      [{ type: "text", text: "" }],
    );
    expect(output.parts[0].text).toBe("");
  });

  it("multiple text parts: collision avoidance within session", async () => {
    const { invokeChat } = await createPlugin();

    // Two text parts, both have emails → second gets <EMAIL_2> due to collision
    const output = await invokeChat(
      { sessionID: "s-multi" },
      [
        { type: "text", text: "First: alice@a.de" },
        { type: "text", text: "Second: bob@b.de" },
      ],
    );
    // First part gets <EMAIL_1>
    expect(output.parts[0].text).toContain("<EMAIL_1>");
    expect(output.parts[0].text).not.toContain("alice@a.de");
    // Second part: detector resets counters, generates <EMAIL_1>, but store has
    // alice@a.de at <EMAIL_1>, so collision avoidance gives <EMAIL_1_1>
    expect(output.parts[1].text).not.toContain("bob@b.de");
    expect(output.parts[1].text).toContain("<EMAIL_2>");
  });

  it("rehydrate individual text parts via text.complete", async () => {
    const { invokeChat, invokeRehydrate } = await createPlugin();

    // Store data (both emails in single message → sequential counters)
    await invokeChat(
      { sessionID: "s-multi-r" },
      [{ type: "text", text: "alice@a.de and bob@b.de" }],
    );

    // Rehydrate two separate text parts (simulating two text.complete calls)
    const r1 = await invokeRehydrate("s-multi-r", "Found <EMAIL_1>");
    const r2 = await invokeRehydrate("s-multi-r", "Also <EMAIL_2>");
    expect(r1.text).toContain("alice@a.de");
    expect(r2.text).toContain("bob@b.de");
  });
});
