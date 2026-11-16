import { describe, expect, it } from "vitest";
import { isValidMonths, isValidPaymentId } from "../src/ids";
import { MAX_MONTHS } from "../src/months";

describe("isValidPaymentId", () => {
  it("accepts letters, digits, hyphens and underscores", () => {
    expect(isValidPaymentId("txn-1_msg-2")).toBe(true);
  });

  it("accepts up to 128 characters and no more", () => {
    expect(isValidPaymentId("a".repeat(128))).toBe(true);
    expect(isValidPaymentId("a".repeat(129))).toBe(false);
    expect(isValidPaymentId("a".repeat(200))).toBe(false);
  });

  it.each(["", "a/b", "a b", "a.b", "__x__"])("rejects %j", (id) => {
    expect(isValidPaymentId(id)).toBe(false);
  });
});

describe("isValidMonths", () => {
  it("accepts whole numbers from 1 to MAX_MONTHS", () => {
    expect(isValidMonths(1)).toBe(true);
    expect(isValidMonths(MAX_MONTHS)).toBe(true);
  });

  it.each([0, MAX_MONTHS + 1, 1.5, Number.NaN, "5", undefined, null])("rejects %j", (value) => {
    expect(isValidMonths(value)).toBe(false);
  });
});
