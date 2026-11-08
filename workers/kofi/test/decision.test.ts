import { describe, expect, it } from "vitest";
import { decideGrant } from "../src/decision";

const now = new Date("2026-11-08T12:00:00.000Z");

describe("decideGrant", () => {
  it("grants from now when there is no entitlement", () => {
    const decision = decideGrant({ months: 5, existing: null, now });
    expect(decision.status).toBe("granted");
    if (decision.status === "granted") {
      expect(decision.expiresAt.toISOString()).toBe("2027-04-08T12:00:00.000Z");
    }
  });

  it("stacks from a future expiry", () => {
    const decision = decideGrant({
      months: 2,
      existing: { premium: true, expiresAtMs: Date.parse("2027-01-15T00:00:00.000Z") },
      now,
    });
    expect(decision.status).toBe("granted");
    if (decision.status === "granted") {
      expect(decision.expiresAt.toISOString()).toBe("2027-03-15T00:00:00.000Z");
    }
  });

  it("restarts from now when a revoked entitlement still holds a future expiry", () => {
    const decision = decideGrant({
      months: 1,
      existing: { premium: false, expiresAtMs: Date.parse("2027-06-01T00:00:00.000Z") },
      now,
    });
    expect(decision.status).toBe("granted");
    if (decision.status === "granted") {
      expect(decision.expiresAt.toISOString()).toBe("2026-12-08T12:00:00.000Z");
    }
  });

  it("restarts from now when the expiry has passed", () => {
    const decision = decideGrant({
      months: 1,
      existing: { premium: true, expiresAtMs: Date.parse("2026-01-01T00:00:00.000Z") },
      now,
    });
    expect(decision.status).toBe("granted");
    if (decision.status === "granted") {
      expect(decision.expiresAt.toISOString()).toBe("2026-12-08T12:00:00.000Z");
    }
  });

  it("treats a premium entitlement with no expiry as lifetime", () => {
    expect(
      decideGrant({ months: 3, existing: { premium: true, expiresAtMs: null }, now }),
    ).toEqual({ status: "already-lifetime" });
  });

  it("treats an expiry after 2100 as lifetime", () => {
    expect(
      decideGrant({
        months: 1,
        existing: { premium: true, expiresAtMs: Date.parse("9999-12-31T00:00:00.000Z") },
        now,
      }),
    ).toEqual({ status: "already-lifetime" });
  });

  it("still stacks onto an expiry just before 2100", () => {
    const decision = decideGrant({
      months: 1,
      existing: { premium: true, expiresAtMs: Date.parse("2099-12-31T00:00:00.000Z") },
      now,
    });
    expect(decision.status).toBe("granted");
    if (decision.status === "granted") {
      expect(decision.expiresAt.toISOString()).toBe("2100-01-31T00:00:00.000Z");
    }
  });

  it("does not treat a non-premium entitlement without expiry as lifetime", () => {
    const decision = decideGrant({
      months: 1,
      existing: { premium: false, expiresAtMs: null },
      now,
    });
    expect(decision.status).toBe("granted");
  });
});
