import { describe, it, expect } from "bun:test";
import { FourAnonymizerPlugin } from "../src/four-opencode-anonymizer.js";

/** Helper: create plugin and return it + a hook invoker that shares state */
async function createPlugin() {
  const plugin = await FourAnonymizerPlugin({} as any);
  return {
    plugin,
    /** Invoke chat.message hook, mutating output.parts in-place */
    async invoke(
      input: { sessionID?: string; message?: unknown },
      parts: Array<{ type: string; text?: string }>,
    ) {
      const output = { parts: JSON.parse(JSON.stringify(parts)) };
      await plugin["chat.message"]!(input as any, output as any);
      return output;
    },
  };
}

describe("FourAnonymizerPlugin (chat.message hook)", () => {
  // ── User messages (anonymize) ──────────────────────────
  it("anonymizes PII in user message text parts", async () => {
    const { invoke } = await createPlugin();
    const output = await invoke(
      { sessionID: "s1", message: { info: { role: "user" } } },
      [{ type: "text", text: "Email: alice@example.com" }],
    );
    expect(output.parts[0].text).not.toContain("alice@example.com");
    expect(output.parts[0].text).toContain("<EMAIL_");
  });

  it("rehydrates placeholders in assistant message (same plugin instance)", async () => {
    const { invoke } = await createPlugin();

    // Step 1: anonymize user message (populates session store)
    await invoke(
      { sessionID: "s-hyd", message: { info: { role: "user" } } },
      [{ type: "text", text: "Email: bob@test.de" }],
    );

    // Step 2: rehydrate assistant response
    const output = await invoke(
      { sessionID: "s-hyd", message: { info: { role: "assistant" } } },
      [{ type: "text", text: "Ihre E-Mail <EMAIL_1> wurde verarbeitet." }],
    );
    expect(output.parts[0].text).toContain("bob@test.de");
    expect(output.parts[0].text).not.toContain("<EMAIL_1>");
  });

  it("leaves assistant message unchanged when no session store exists", async () => {
    const { invoke } = await createPlugin();
    const output = await invoke(
      { sessionID: "no-store", message: { info: { role: "assistant" } } },
      [{ type: "text", text: "Hello, how can I help?" }],
    );
    expect(output.parts[0].text).toBe("Hello, how can I help?");
  });

  it("ignores messages without info.role", async () => {
    const { invoke } = await createPlugin();
    const output = await invoke(
      { sessionID: "s1", message: {} },
      [{ type: "text", text: "Some system message" }],
    );
    expect(output.parts[0].text).toBe("Some system message");
  });

  it("ignores null/undefined message", async () => {
    const { invoke } = await createPlugin();
    const output = await invoke(
      { sessionID: "s1" },
      [{ type: "text", text: "unchanged" }],
    );
    expect(output.parts[0].text).toBe("unchanged");
  });

  it("handles missing parts gracefully", async () => {
    const { invoke } = await createPlugin();
    const output = await invoke(
      { sessionID: "s1", message: { info: { role: "user" } } },
      [],
    );
    expect(output.parts).toEqual([]);
  });

  it("handles parts with no text field", async () => {
    const { invoke } = await createPlugin();
    const output = await invoke(
      { sessionID: "s1", message: { info: { role: "user" } } },
      [{ type: "image" } as any],
    );
    expect(output.parts[0].text).toBeUndefined();
  });

  it("handles text without PII unchanged in user message", async () => {
    const { invoke } = await createPlugin();
    const output = await invoke(
      { sessionID: "s1", message: { info: { role: "user" } } },
      [{ type: "text", text: "Just a normal sentence." }],
    );
    expect(output.parts[0].text).toBe("Just a normal sentence.");
  });

  // ── Session isolation ──────────────────────────────────
  it("session A cannot rehydrate session B placeholders", async () => {
    const { invoke } = await createPlugin();

    // Session A: anonymize
    await invoke(
      { sessionID: "session-A", message: { info: { role: "user" } } },
      [{ type: "text", text: "alice@secret.de" }],
    );

    // Session B: anonymize different data
    await invoke(
      { sessionID: "session-B", message: { info: { role: "user" } } },
      [{ type: "text", text: "bob@public.de" }],
    );

    // Session B assistant: <EMAIL_1> in session B maps to bob@public.de
    const outputB = await invoke(
      { sessionID: "session-B", message: { info: { role: "assistant" } } },
      [{ type: "text", text: "Ref: <EMAIL_1>" }],
    );
    expect(outputB.parts[0].text).toContain("bob@public.de");
    expect(outputB.parts[0].text).not.toContain("alice@secret.de");
  });

  it("cross-session bleed: Session B cannot access Session A mappings", async () => {
    const { invoke } = await createPlugin();

    // Session A stores alice@secret.de → <EMAIL_1>
    await invoke(
      { sessionID: "session-A", message: { info: { role: "user" } } },
      [{ type: "text", text: "alice@secret.de" }],
    );

    // Session B has NO user message → NO mappings
    // Assistant response in Session B with <EMAIL_1> should NOT find alice@secret.de
    const outputB = await invoke(
      { sessionID: "session-B", message: { info: { role: "assistant" } } },
      [{ type: "text", text: "<EMAIL_1> should stay" }],
    );
    // No session-B store exists → message unchanged
    expect(outputB.parts[0].text).toBe("<EMAIL_1> should stay");
  });

  it("default sessionId 'unknown' when no sessionID provided", async () => {
    const { invoke } = await createPlugin();
    const output = await invoke(
      { message: { info: { role: "user" } } },
      [{ type: "text", text: "test@example.com" }],
    );
    expect(output.parts[0].text).not.toContain("test@example.com");
    expect(output.parts[0].text).toContain("<EMAIL_");
  });

  // ── Edge cases ─────────────────────────────────────────
  it("rehydrate: unknown placeholders left unchanged", async () => {
    const { invoke } = await createPlugin();

    // Store one email
    await invoke(
      { sessionID: "s-edge", message: { info: { role: "user" } } },
      [{ type: "text", text: "real@test.de" }],
    );

    // Assistant uses a placeholder that was never stored
    const output = await invoke(
      { sessionID: "s-edge", message: { info: { role: "assistant" } } },
      [{ type: "text", text: "Unknown <EMAIL_99> in text" }],
    );
    expect(output.parts[0].text).toContain("<EMAIL_99>");
    expect(output.parts[0].text).not.toContain("real@test.de");
  });

  it("empty user message text is handled", async () => {
    const { invoke } = await createPlugin();
    const output = await invoke(
      { sessionID: "s1", message: { info: { role: "user" } } },
      [{ type: "text", text: "" }],
    );
    expect(output.parts[0].text).toBe("");
  });

  it("multiple text parts: collision avoidance within session", async () => {
    const { invoke } = await createPlugin();

    // Two text parts, both have emails → second gets _1 suffix due to collision
    const output = await invoke(
      { sessionID: "s-multi", message: { info: { role: "user" } } },
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
    expect(output.parts[1].text).toMatch(/<EMAIL_\d+(_\d+)?>/);
  });

  it("assistant rehydrate across multiple parts", async () => {
    const { invoke } = await createPlugin();

    // Store data (both emails in single message → sequential counters)
    await invoke(
      { sessionID: "s-multi-r", message: { info: { role: "user" } } },
      [{ type: "text", text: "alice@a.de and bob@b.de" }],
    );

    // Rehydrate multi-part assistant response
    const output = await invoke(
      { sessionID: "s-multi-r", message: { info: { role: "assistant" } } },
      [
        { type: "text", text: "Found <EMAIL_1>" },
        { type: "text", text: "Also <EMAIL_2>" },
      ],
    );
    expect(output.parts[0].text).toContain("alice@a.de");
    expect(output.parts[1].text).toContain("bob@b.de");
  });
});
