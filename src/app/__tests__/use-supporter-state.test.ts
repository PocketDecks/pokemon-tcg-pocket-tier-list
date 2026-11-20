import { describe, expect, it } from "vitest";
import { supporterStateOf } from "../use-supporter-state";

const LIFETIME_THRESHOLD_MS = Date.UTC(2100, 0, 1);

describe("supporterStateOf", () => {
  it("waits while the entitlement is loading", () => {
    expect(supporterStateOf(null, null)).toBe("loading");
    expect(supporterStateOf(null, Date.UTC(2027, 0, 2))).toBe("loading");
  });

  it("calls an active grant with no expiry lifetime", () => {
    expect(supporterStateOf(true, null)).toBe("lifetime");
  });

  it("calls an active grant that ends after 1 January 2100 lifetime", () => {
    expect(supporterStateOf(true, LIFETIME_THRESHOLD_MS + 1)).toBe("lifetime");
    expect(supporterStateOf(true, Date.UTC(2999, 11, 31))).toBe("lifetime");
  });

  it("calls an active grant that ends on or before 1 January 2100 dated", () => {
    expect(supporterStateOf(true, LIFETIME_THRESHOLD_MS)).toBe("expires");
    expect(supporterStateOf(true, Date.UTC(2027, 1, 20))).toBe("expires");
  });

  it("calls an inactive grant that still has an expiry ended", () => {
    expect(supporterStateOf(false, Date.UTC(2026, 2, 15))).toBe("ended");
  });

  it("calls an inactive account with no grant none", () => {
    expect(supporterStateOf(false, null)).toBe("none");
  });
});
