import { describe, expect, it } from "vitest";

import {
  ENTITLEMENT_COLLECTION,
  parseGrantArgs,
  planPremiumGrant,
} from "../utils/premium-grant";

const now = new Date("2026-11-07T10:00:00.000Z");
const uid = "AbC123xyz_-9";

describe("planPremiumGrant", () => {
  it("builds an open-ended grant with the default source", () => {
    const plan = planPremiumGrant({ uid, now });

    expect(ENTITLEMENT_COLLECTION).toBe("entitlements");
    expect(plan).toEqual({
      path: `entitlements/${uid}`,
      data: { premium: true, source: "manual", expiresAt: null, updatedAt: now },
    });
  });

  it("adds the account email in lower case", () => {
    const plan = planPremiumGrant({ uid, email: " Ash@Example.com ", now });

    expect(plan.data).toEqual({
      premium: true,
      source: "manual",
      expiresAt: null,
      updatedAt: now,
      email: "ash@example.com",
    });
  });

  it("leaves the email off when it is blank", () => {
    const plan = planPremiumGrant({ uid, email: "  ", now });

    expect(plan.data).not.toHaveProperty("email");
  });

  it("expires a dated grant at the end of that day in UTC", () => {
    const plan = planPremiumGrant({ uid, until: "2026-12-31", source: "invoice", now });

    expect(plan.data).toEqual({
      premium: true,
      source: "invoice",
      expiresAt: new Date("2026-12-31T23:59:59.999Z"),
      updatedAt: now,
    });
  });

  it("accepts today as the last valid day", () => {
    const plan = planPremiumGrant({ uid, until: "2026-11-07", now });

    expect(plan.data.expiresAt).toEqual(new Date("2026-11-07T23:59:59.999Z"));
  });

  it("builds a revocation that keeps the source and clears the expiry", () => {
    const plan = planPremiumGrant({ uid, revoke: true, source: "refund", now });

    expect(plan).toEqual({
      path: `entitlements/${uid}`,
      data: { premium: false, source: "refund", expiresAt: null, updatedAt: now },
    });
  });

  it("ignores an email on a revocation, so a revoke leaves the stored email alone", () => {
    const plan = planPremiumGrant({ uid, revoke: true, email: "ash@example.com", now });

    expect(plan.data).toEqual({ premium: false, source: "manual", expiresAt: null, updatedAt: now });
  });

  it.each(["", "a/b", "..", "has space", "x".repeat(129), "café"])(
    "rejects the uid %j",
    (bad) => {
      expect(() => planPremiumGrant({ uid: bad, now })).toThrow(/uid/i);
    }
  );

  it.each(["2026-11-06", "2020-01-01"])("rejects the past date %s", (date) => {
    expect(() => planPremiumGrant({ uid, until: date, now })).toThrow(/future|past/i);
  });

  it.each(["2026-13-01", "2026-02-30", "07/11/2027", "2027-1-1", "tomorrow"])(
    "rejects the malformed date %s",
    (date) => {
      expect(() => planPremiumGrant({ uid, until: date, now })).toThrow(/YYYY-MM-DD/);
    }
  );

  it.each(["", "has space", "x".repeat(65)])("rejects the source %j", (source) => {
    expect(() => planPremiumGrant({ uid, source, now })).toThrow(/source/i);
  });

  it("rejects an expiry on a revocation", () => {
    expect(() => planPremiumGrant({ uid, revoke: true, until: "2027-01-01", now })).toThrow(
      /revoke/i
    );
  });
});

describe("parseGrantArgs", () => {
  it("parses every flag", () => {
    expect(
      parseGrantArgs(["--uid", uid, "--until", "2027-01-01", "--source", "gift", "--dry-run"])
    ).toEqual({ uid, until: "2027-01-01", source: "gift", revoke: false, dryRun: true });
  });

  it("parses a revocation", () => {
    expect(parseGrantArgs(["--uid", uid, "--revoke"])).toEqual({
      uid,
      until: undefined,
      source: undefined,
      revoke: true,
      dryRun: false,
    });
  });

  it("requires a uid", () => {
    expect(() => parseGrantArgs(["--until", "2027-01-01"])).toThrow(/--uid/);
  });

  it("rejects unknown flags", () => {
    expect(() => parseGrantArgs(["--uid", uid, "--forever"])).toThrow();
  });
});
