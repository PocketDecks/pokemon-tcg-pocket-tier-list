import { describe, expect, it } from "vitest";
import { entitlementPath, entitlementWrite, isSafeUid } from "../src/entitlement";

describe("entitlementWrite", () => {
  it("merges the four grant fields into entitlements/{uid}", () => {
    const expiresAt = new Date("2027-01-01T00:00:00.000Z");
    const now = new Date("2026-11-16T00:00:00.000Z");
    expect(entitlementWrite("ash_1", expiresAt, "kofi", now)).toEqual({
      kind: "merge",
      path: "entitlements/ash_1",
      fields: { premium: true, source: "kofi", expiresAt, updatedAt: now },
    });
    expect(entitlementPath("ash_1")).toBe("entitlements/ash_1");
  });

  it("adds the account email when there is one", () => {
    const expiresAt = new Date("2027-01-01T00:00:00.000Z");
    const now = new Date("2026-11-16T00:00:00.000Z");
    expect(entitlementWrite("ash_1", expiresAt, "kofi", now, "ash@example.com")).toEqual({
      kind: "merge",
      path: "entitlements/ash_1",
      fields: {
        premium: true,
        source: "kofi",
        expiresAt,
        updatedAt: now,
        email: "ash@example.com",
      },
    });
  });

  it("leaves the email out when the account has none, so a merge keeps what is stored", () => {
    const expiresAt = new Date("2027-01-01T00:00:00.000Z");
    const now = new Date("2026-11-16T00:00:00.000Z");
    expect(entitlementWrite("ash_1", expiresAt, "kofi", now, null)).toEqual({
      kind: "merge",
      path: "entitlements/ash_1",
      fields: { premium: true, source: "kofi", expiresAt, updatedAt: now },
    });
  });
});

describe("isSafeUid", () => {
  it("takes the contract's pattern", () => {
    expect(isSafeUid("abc-DEF_123")).toBe(true);
    for (const bad of ["", "a/b", "a#b", "a b", "a".repeat(129), null, 5]) {
      expect(isSafeUid(bad)).toBe(false);
    }
  });
});
