import { describe, it, expect } from "bun:test";
import { FourAnonymizerPlugin } from "../src/four-opencode-anonymizer.js";

/** Helper: create plugin and return it + hook invokers that share state */
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
    /** Invoke experimental.text.complete hook (scrub assistant output before persist) */
    async invokeTextComplete(sessionID: string, text: string) {
      const output = { text };
      const input = { sessionID, messageID: "msg-1", partID: "part-1" };
      await plugin["experimental.text.complete"]!(input as any, output as any);
      return output;
    },
    /** Invoke tool.execute.after hook */
    async invokeToolAfter(sessionID: string, outputText: string) {
      const output: any = { title: "tool", output: outputText, metadata: {} };
      await plugin["tool.execute.after"]!(
        { tool: "read", sessionID, callID: "call-1", args: {} } as any,
        output,
      );
      return output;
    },
    /** Invoke experimental.chat.messages.transform */
    async invokeMessagesTransform(messages: any[]) {
      const output = { messages };
      await plugin["experimental.chat.messages.transform"]!({} as any, output as any);
      return output;
    },
    /** Invoke experimental.chat.system.transform */
    async invokeSystemTransform(sessionID: string, system: string[]) {
      const output = { system };
      await plugin["experimental.chat.system.transform"]!({ sessionID, model: {} } as any, output as any);
      return output;
    },
    async invokeEvent(event: any) {
      await plugin.event!({ event } as any);
    },
    async invokeDispose() {
      await plugin.dispose!();
    },
  };
}

describe("FourAnonymizerPlugin (chat.message hook)", () => {
  it("anonymizes PII in user message text parts", async () => {
    const { invokeChat } = await createPlugin();
    const output = await invokeChat(
      { sessionID: "s1" },
      [{ type: "text", text: "Email: alice@example.com" }],
    );
    expect(output.parts[0].text).not.toContain("alice@example.com");
    expect(output.parts[0].text).toContain("<EMAIL_");
  });

  it("does NOT rehydrate assistant output in experimental.text.complete", async () => {
    const { invokeChat, invokeTextComplete } = await createPlugin();

    await invokeChat(
      { sessionID: "s-hyd" },
      [{ type: "text", text: "Email: bob@test.de" }],
    );

    const result = await invokeTextComplete("s-hyd", "Ihre E-Mail <EMAIL_1> wurde verarbeitet.");
    // The part is persisted and replayed to the provider — it must stay a placeholder.
    expect(result.text).toContain("<EMAIL_1>");
    expect(result.text).not.toContain("bob@test.de");
  });

  it("scrubs an original echoed by the model before persisting it", async () => {
    const { invokeTextComplete } = await createPlugin();
    const result = await invokeTextComplete("s-echo", "Kontakt: eve@example.com");
    expect(result.text).not.toContain("eve@example.com");
    expect(result.text).toContain("<EMAIL_");
  });

  it("text.complete leaves clean text unchanged", async () => {
    const { invokeTextComplete } = await createPlugin();
    const result = await invokeTextComplete("no-store", "Hello, how can I help?");
    expect(result.text).toBe("Hello, how can I help?");
  });

  it("handles missing parts gracefully", async () => {
    const { invokeChat } = await createPlugin();
    const output = await invokeChat({ sessionID: "s1" }, []);
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

  it("default sessionId 'unknown' when no sessionID provided", async () => {
    const { invokeChat } = await createPlugin();
    const output = await invokeChat(
      {},
      [{ type: "text", text: "test@example.com" }],
    );
    expect(output.parts[0].text).not.toContain("test@example.com");
    expect(output.parts[0].text).toContain("<EMAIL_");
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
    const output = await invokeChat(
      { sessionID: "s-multi" },
      [
        { type: "text", text: "First: alice@a.de" },
        { type: "text", text: "Second: bob@b.de" },
      ],
    );
    expect(output.parts[0].text).toContain("<EMAIL_1>");
    expect(output.parts[0].text).not.toContain("alice@a.de");
    expect(output.parts[1].text).not.toContain("bob@b.de");
    expect(output.parts[1].text).toContain("<EMAIL_2>");
  });
});

describe("FourAnonymizerPlugin (tool.execute.after hook)", () => {
  it("scrubs PII returned by a tool", async () => {
    const { invokeToolAfter } = await createPlugin();
    const output = await invokeToolAfter("s-tool", "Found contact: carol@corp.de");
    expect(output.output).not.toContain("carol@corp.de");
    expect(output.output).toContain("<EMAIL_");
  });

  it("does NOT rehydrate placeholders in tool output", async () => {
    const { invokeChat, invokeToolAfter } = await createPlugin();
    await invokeChat({ sessionID: "s-tool2" }, [{ type: "text", text: "Email: dave@corp.de" }]);

    const output = await invokeToolAfter("s-tool2", "tool says <EMAIL_1>");
    expect(output.output).toBe("tool says <EMAIL_1>");
  });

  it("leaves empty tool output untouched", async () => {
    const { invokeToolAfter } = await createPlugin();
    const output = await invokeToolAfter("s-tool3", "");
    expect(output.output).toBe("");
  });

  it("scrubs MCP-style content arrays", async () => {
    const { plugin } = await createPlugin();
    const output: any = {
      title: "mcp",
      content: [{ type: "text", text: "contact: alice@mcp.de" }],
    };
    await plugin["tool.execute.after"]!(
      { tool: "mcp_tool", sessionID: "s-mcp", callID: "c", args: {} } as any,
      output,
    );
    expect(output.content[0].text).not.toContain("alice@mcp.de");
    expect(output.content[0].text).toContain("<EMAIL_");
  });
});

describe("FourAnonymizerPlugin (model-bound transform hooks)", () => {
  it("scrubs text, reasoning and tool content at request time", async () => {
    const { invokeMessagesTransform } = await createPlugin();
    const messages = [
      {
        info: { sessionID: "s-transform", role: "user" },
        parts: [{ type: "text", text: "Mail me at alice@a.de" }],
      },
      {
        info: { sessionID: "s-transform", role: "assistant" },
        parts: [
          { type: "reasoning", text: "The user is alice@a.de" },
          {
            type: "tool",
            state: {
              status: "completed",
              input: { recipient: "alice@a.de" },
              output: "sent to alice@a.de",
            },
          },
          {
            type: "tool",
            state: {
              status: "error",
              input: {},
              error: "failed for alice@a.de",
              metadata: { output: "alice@a.de" },
            },
          },
        ],
      },
    ];

    const output = await invokeMessagesTransform(messages);
    const serialized = JSON.stringify(output.messages);
    expect(serialized).not.toContain("alice@a.de");
    expect(serialized).toContain("<EMAIL_");
  });

  it("is idempotent on already-anonymized content", async () => {
    const { invokeChat, invokeMessagesTransform } = await createPlugin();
    const chat = await invokeChat(
      { sessionID: "s-idem" },
      [{ type: "text", text: "alice@idem.de" }],
    );
    const messages = [
      { info: { sessionID: "s-idem", role: "user" }, parts: chat.parts },
    ];

    const first = await invokeMessagesTransform(messages);
    const firstText = first.messages[0].parts[0].text;
    const second = await invokeMessagesTransform(messages);
    expect(second.messages[0].parts[0].text).toBe(firstText);
    expect(firstText).toContain("<EMAIL_1>");
  });

  it("scrubs system prompt additions", async () => {
    const { invokeSystemTransform } = await createPlugin();
    const output = await invokeSystemTransform("s-system", [
      "Project owner: frank@example.com",
      "No PII here",
    ]);
    expect(output.system[0]).not.toContain("frank@example.com");
    expect(output.system[0]).toContain("<EMAIL_");
    expect(output.system[1]).toBe("No PII here");
  });
});

describe("FourAnonymizerPlugin (session lifecycle)", () => {
  it("session A and session B keep independent mappings", async () => {
    const { invokeChat, invokeMessagesTransform } = await createPlugin();
    await invokeChat({ sessionID: "session-A" }, [{ type: "text", text: "alice@secret.de" }]);
    await invokeChat({ sessionID: "session-B" }, [{ type: "text", text: "bob@public.de" }]);

    const a = await invokeMessagesTransform([
      { info: { sessionID: "session-A", role: "assistant" }, parts: [{ type: "text", text: "Contact <EMAIL_1>" }] },
    ]);
    const b = await invokeMessagesTransform([
      { info: { sessionID: "session-B", role: "assistant" }, parts: [{ type: "text", text: "Contact <EMAIL_1>" }] },
    ]);
    // Neither placeholder is turned into an original by the model-bound path.
    expect(JSON.stringify(a.messages)).not.toContain("alice@secret.de");
    expect(JSON.stringify(b.messages)).not.toContain("bob@public.de");
  });

  it("session.deleted drops the session store", async () => {
    const { invokeChat, invokeEvent } = await createPlugin();
    await invokeChat({ sessionID: "s-del" }, [{ type: "text", text: "alice@a.de" }]);
    await invokeEvent({ type: "session.deleted", properties: { info: { id: "s-del" } } });

    // A fresh store restarts counters: bob gets <EMAIL_1>, not a collision suffix.
    const output = await invokeChat({ sessionID: "s-del" }, [{ type: "text", text: "bob@b.de" }]);
    expect(output.parts[0].text).toContain("<EMAIL_1>");
    expect(output.parts[0].text).not.toContain("<EMAIL_1_1>");
  });

  it("dispose clears all session stores", async () => {
    const { invokeChat, invokeDispose } = await createPlugin();
    await invokeChat({ sessionID: "s-dispose" }, [{ type: "text", text: "alice@a.de" }]);
    await invokeDispose();

    const output = await invokeChat({ sessionID: "s-dispose" }, [{ type: "text", text: "bob@b.de" }]);
    expect(output.parts[0].text).toContain("<EMAIL_1>");
    expect(output.parts[0].text).not.toContain("<EMAIL_1_1>");
  });

  it("ignores unrelated events", async () => {
    const { invokeEvent } = await createPlugin();
    await invokeEvent({ type: "session.idle", properties: { sessionID: "x" } });
  });
});
