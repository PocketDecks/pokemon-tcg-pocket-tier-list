import { describe, expect, it } from "vitest";
import { PREMIUM_DECK_SLUGS, premiumWindowsForSlug } from "../premium-deck-slugs";

describe("premiumWindowsForSlug", () => {
  const list = {
    "mega-altaria-ex-b1-102&bonsly-b3-078": ["30d", "all"],
    "old-a1-009": ["all"],
  } as const;

  it("returns the windows that offer a premium-only deck, in order", () => {
    expect(premiumWindowsForSlug("mega-altaria-ex-b1-102&bonsly-b3-078", list)).toEqual(["30d", "all"]);
    expect(premiumWindowsForSlug("old-a1-009", list)).toEqual(["all"]);
  });

  it("returns nothing for a slug the list does not name", () => {
    expect(premiumWindowsForSlug("garchomp-a2-123", list)).toEqual([]);
    expect(premiumWindowsForSlug("", list)).toEqual([]);
  });

  it("does not treat object prototype keys as slugs", () => {
    expect(premiumWindowsForSlug("constructor", list)).toEqual([]);
    expect(premiumWindowsForSlug("__proto__", list)).toEqual([]);
  });

  it("drops anything that is not a premium window", () => {
    expect(premiumWindowsForSlug("x", { x: ["20d", "30d", "bogus"] })).toEqual(["30d"]);
  });

  it("ships an empty committed list while every window is identical", () => {
    expect(PREMIUM_DECK_SLUGS).toEqual({});
  });
});
