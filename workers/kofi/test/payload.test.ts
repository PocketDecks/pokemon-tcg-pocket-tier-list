import { describe, expect, it } from "vitest";
import { parseKofiPayload } from "../src/payload";

const base = {
  verification_token: "secret-token",
  message_id: "msg-1",
  timestamp: "2026-11-08T11:59:00Z",
  type: "Donation",
  is_public: true,
  from_name: "Ash",
  message: "Thanks",
  amount: "5.00",
  url: "https://ko-fi.com/Home/CoffeeShop?txid=abc",
  email: "ash@example.com",
  currency: "GBP",
  is_subscription_payment: false,
  is_first_subscription_payment: false,
  kofi_transaction_id: "txn-1",
};

const without = (...keys: string[]) =>
  Object.fromEntries(Object.entries(base).filter(([key]) => !keys.includes(key)));

const form = (value: unknown) => `data=${encodeURIComponent(JSON.stringify(value))}`;

describe("parseKofiPayload", () => {
  it("parses a valid form body", () => {
    const parsed = parseKofiPayload(form(base));
    expect(parsed).toMatchObject({
      verificationToken: "secret-token",
      id: "txn-1-msg-1",
      type: "Donation",
      fromName: "Ash",
      message: "Thanks",
      amount: "5.00",
      email: "ash@example.com",
      currency: "GBP",
      timestamp: "2026-11-08T11:59:00Z",
      isSubscriptionPayment: false,
    });
  });

  it("falls back to message_id when there is no transaction id", () => {
    expect(parseKofiPayload(form(without("kofi_transaction_id")))?.id).toBe("msg-1");
  });

  it("uses the transaction id alone when there is no message id", () => {
    expect(parseKofiPayload(form(without("message_id")))?.id).toBe("txn-1");
  });

  it("rejects a combined id that is unsafe through its message id", () => {
    expect(parseKofiPayload(form({ ...base, message_id: "a/b" }))).toBeNull();
  });

  it("rejects a body without the data field", () => {
    expect(parseKofiPayload("other=1")).toBeNull();
  });

  it("rejects invalid JSON", () => {
    expect(parseKofiPayload("data=%7Bnope")).toBeNull();
  });

  it("rejects a JSON value that is not an object", () => {
    expect(parseKofiPayload(form([1, 2]))).toBeNull();
    expect(parseKofiPayload(form("text"))).toBeNull();
  });

  it("rejects a missing token, amount, currency or id", () => {
    expect(parseKofiPayload(form({ ...base, verification_token: undefined }))).toBeNull();
    expect(parseKofiPayload(form({ ...base, amount: undefined }))).toBeNull();
    expect(parseKofiPayload(form({ ...base, currency: undefined }))).toBeNull();
    expect(
      parseKofiPayload(form({ ...base, kofi_transaction_id: undefined, message_id: undefined })),
    ).toBeNull();
  });

  it("rejects an amount that is not a decimal", () => {
    expect(parseKofiPayload(form({ ...base, amount: "five" }))).toBeNull();
    expect(parseKofiPayload(form({ ...base, amount: "-1.00" }))).toBeNull();
  });

  it("rejects an id that is unsafe as a document name", () => {
    expect(parseKofiPayload(form({ ...base, kofi_transaction_id: "a/b" }))).toBeNull();
  });

  it("rejects an id Firestore reserves", () => {
    const single = without("message_id");
    expect(parseKofiPayload(form({ ...single, kofi_transaction_id: "__abc__" }))).toBeNull();
    expect(parseKofiPayload(form({ ...single, kofi_transaction_id: "____" }))).toBeNull();
    expect(parseKofiPayload(form({ ...single, kofi_transaction_id: "__abc" }))?.id).toBe("__abc");
    expect(parseKofiPayload(form({ ...single, kofi_transaction_id: "abc__" }))?.id).toBe("abc__");
  });

  it("defaults optional text fields to empty strings", () => {
    const parsed = parseKofiPayload(form(without("email", "message", "from_name")));
    expect(parsed).toMatchObject({ email: "", message: "", fromName: "" });
  });
});
