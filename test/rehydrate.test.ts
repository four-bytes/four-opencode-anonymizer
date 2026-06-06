import { describe, it, expect } from "bun:test";
import { rehydrateText } from "../src/rehydrate.js";
import { createSessionStore } from "../src/session-store.js";

describe("rehydrateText", () => {
  it("replaces placeholder with original", () => {
    const store = createSessionStore("s1");
    store.store("john@example.com", "<EMAIL_1>", "email");
    store.store("+49 170 1234567", "<PHONE_1>", "phone");

    const text = "Contact <EMAIL_1> or call <PHONE_1>";
    const result = rehydrateText(text, store);

    expect(result).toContain("john@example.com");
    expect(result).toContain("+49 170 1234567");
    expect(result).not.toContain("<EMAIL_1>");
  });

  it("leaves unknown placeholders unchanged", () => {
    const store = createSessionStore("s1");
    const text = "Unknown <EMAIL_99> placeholder";
    const result = rehydrateText(text, store);
    expect(result).toContain("<EMAIL_99>");
  });

  it("leaves non-placeholder text unchanged", () => {
    const store = createSessionStore("s1");
    const text = "Just a normal message with no placeholders.";
    const result = rehydrateText(text, store);
    expect(result).toBe(text);
  });

  it("handles empty string", () => {
    const store = createSessionStore("s1");
    expect(rehydrateText("", store)).toBe("");
  });

  it("rehydrates multiple placeholders of different types", () => {
    const store = createSessionStore("s2");
    store.store("DE89370400440532013000", "<IBAN_1>", "iban");
    store.store("alice@test.de", "<EMAIL_2>", "email");

    const text = "IBAN: <IBAN_1>, Email: <EMAIL_2>";
    const result = rehydrateText(text, store);

    expect(result).toContain("DE89370400440532013000");
    expect(result).toContain("alice@test.de");
    expect(result).not.toContain("<IBAN_1>");
    expect(result).not.toContain("<EMAIL_2>");
  });

  it("does NOT bleed: session A placeholders unknown in session B", () => {
    const storeA = createSessionStore("session-A");
    storeA.store("alice@secret.de", "<EMAIL_1>", "email");

    const storeB = createSessionStore("session-B");
    storeB.store("bob@public.de", "<EMAIL_1>", "email");

    // Session B rehydrating should NOT see Session A's data
    const text = "Contact <EMAIL_1>";
    const resultB = rehydrateText(text, storeB);
    expect(resultB).toContain("bob@public.de");
    expect(resultB).not.toContain("alice@secret.de");

    // Session A rehydrating should NOT see Session B's data
    const resultA = rehydrateText(text, storeA);
    expect(resultA).toContain("alice@secret.de");
    expect(resultA).not.toContain("bob@public.de");
  });

  it("rehydrates new PII types (credit_card, bank_account, reference)", () => {
    const store = createSessionStore("s3");
    store.store("4111111111111111", "<CREDIT_CARD_1>", "credit_card");
    store.store("1234567890", "<BANK_ACCOUNT_1>", "bank_account");
    store.store("ABC-12345-XYZ", "<REFERENCE_1>", "reference");

    const text = "Card: <CREDIT_CARD_1>, Konto: <BANK_ACCOUNT_1>, Ref: <REFERENCE_1>";
    const result = rehydrateText(text, store);

    expect(result).toContain("4111111111111111");
    expect(result).toContain("1234567890");
    expect(result).toContain("ABC-12345-XYZ");
    expect(result).not.toContain("<CREDIT_CARD_");
    expect(result).not.toContain("<BANK_ACCOUNT_");
    expect(result).not.toContain("<REFERENCE_");
  });
  it("rehydrates collision-avoidance placeholders (_1_1 suffix)", () => {
    const store = createSessionStore("s-collision");
    // First email maps to <EMAIL_1>
    store.store("alice@collision.de", "<EMAIL_1>", "email");
    // Second (different) email gets collision suffix <EMAIL_1_1>
    store.store("bob@collision.de", "<EMAIL_1_1>", "email");
    // Third email maps to <EMAIL_2>
    store.store("carol@collision.de", "<EMAIL_2>", "email");

    const text = "Users: <EMAIL_1>, <EMAIL_1_1>, <EMAIL_2>";
    const result = rehydrateText(text, store);

    expect(result).toContain("alice@collision.de");
    expect(result).toContain("bob@collision.de");
    expect(result).toContain("carol@collision.de");
    expect(result).not.toContain("<EMAIL_1_1>");
    expect(result).not.toContain("<EMAIL_2>");
  });

});
