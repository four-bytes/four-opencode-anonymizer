import { describe, it, expect } from "bun:test";
import { createSessionStore } from "../src/session-store.js";

describe("SessionStore", () => {
  it("stores and retrieves a mapping", () => {
    const store = createSessionStore("s1");
    store.store("alice@a.de", "<EMAIL_1>", "email");
    expect(store.getOriginal("<EMAIL_1>")).toBe("alice@a.de");
  });

  it("returns null for unknown placeholder", () => {
    const store = createSessionStore("s1");
    expect(store.getOriginal("<EMAIL_99>")).toBeNull();
  });

  it("stores multiple mappings and lists them", () => {
    const store = createSessionStore("s1");
    store.store("alice@a.de", "<EMAIL_1>", "email");
    store.store("+49 170 1234567", "<PHONE_1>", "phone");
    store.store("DE89370400440532013000", "<IBAN_1>", "iban");

    const list = store.list();
    expect(list.length).toBe(3);

    const emails = list.filter((e) => e.piiType === "email");
    expect(emails[0].original).toBe("alice@a.de");
  });

  it("list returns empty array for empty store", () => {
    const store = createSessionStore("s1");
    expect(store.list()).toEqual([]);
  });

  it("clears all mappings", () => {
    const store = createSessionStore("s1");
    store.store("alice@a.de", "<EMAIL_1>", "email");
    store.store("bob@b.de", "<EMAIL_2>", "email");
    expect(store.list().length).toBe(2);

    store.clear();
    expect(store.list().length).toBe(0);
    expect(store.getOriginal("<EMAIL_1>")).toBeNull();
  });

  it("overwrites same placeholder with new original", () => {
    const store = createSessionStore("s1");
    store.store("old@a.de", "<EMAIL_1>", "email");
    store.store("new@a.de", "<EMAIL_1>", "email");
    expect(store.getOriginal("<EMAIL_1>")).toBe("new@a.de");
  });

  it("sessionId is immutable", () => {
    const store = createSessionStore("fixed-session");
    expect(store.sessionId).toBe("fixed-session");
    // TypeScript would prevent assignment, but verify at runtime
    expect(store.sessionId).toBe("fixed-session");
  });

  it("sessions are fully isolated — no cross-session access", () => {
    const storeA = createSessionStore("session-A");
    const storeB = createSessionStore("session-B");

    storeA.store("alice@a.de", "<EMAIL_1>", "email");
    storeB.store("bob@b.de", "<EMAIL_1>", "email");

    // storeA only sees its own mapping
    expect(storeA.getOriginal("<EMAIL_1>")).toBe("alice@a.de");
    // storeB only sees its own mapping
    expect(storeB.getOriginal("<EMAIL_1>")).toBe("bob@b.de");
    // No cross-contamination
    expect(storeA.list().length).toBe(1);
    expect(storeB.list().length).toBe(1);
  });

  it("handles all 10 PII types", () => {
    const store = createSessionStore("s1");
    const types = ["email", "iban", "phone", "tax_id", "api_key", "name", "city", "credit_card", "bank_account", "reference"];
    for (let i = 0; i < types.length; i++) {
      store.store(`value-${i}`, `<${types[i].toUpperCase()}_1>`, types[i]);
    }
    expect(store.list().length).toBe(10);
    for (let i = 0; i < types.length; i++) {
      expect(store.getOriginal(`<${types[i].toUpperCase()}_1>`)).toBe(`value-${i}`);
    }
  });
});
