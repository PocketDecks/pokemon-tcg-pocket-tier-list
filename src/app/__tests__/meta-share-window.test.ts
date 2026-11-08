import { describe, expect, it } from "vitest";
import { hasMovement, settleAllNewShares } from "../meta-share-window";
import type { MetaShareEntry } from "../../types/pipeline-data";

const entry = (name: string, overrides: Partial<MetaShareEntry> = {}): MetaShareEntry => ({
  name,
  share: 0.1,
  sharePrev: 0,
  delta: 0.1,
  windowGames: 100,
  firstSeen: "2026-10-30",
  isNew: true,
  ...overrides,
});

describe("settleAllNewShares", () => {
  it("turns an all-new window into no-new entries with zero delta and the same share", () => {
    const settled = settleAllNewShares([entry("a"), entry("b", { share: 0.2, delta: 0.2 })]);
    expect(settled).toEqual([
      { ...entry("a"), isNew: false, delta: 0 },
      { ...entry("b", { share: 0.2, delta: 0.2 }), isNew: false, delta: 0 },
    ]);
  });

  it("leaves a mixed window unchanged, so genuinely new decks keep their badge", () => {
    const mixed = [entry("a"), entry("b", { isNew: false, sharePrev: 0.05, delta: 0.05 })];
    expect(settleAllNewShares(mixed)).toEqual(mixed);
  });

  it("leaves an empty window unchanged", () => {
    expect(settleAllNewShares([])).toEqual([]);
  });

  it("treats a single new deck as an all-new window", () => {
    expect(settleAllNewShares([entry("a")])).toEqual([{ ...entry("a"), isNew: false, delta: 0 }]);
  });
  it("settles the entries that carry movement and leaves the others as they are", () => {
    const trimmed: MetaShareEntry = { name: "c", share: 0.05, windowGames: 40 };

    expect(settleAllNewShares([entry("a"), trimmed])).toEqual([
      { ...entry("a"), isNew: false, delta: 0 },
      trimmed,
    ]);
  });

  it("leaves entries that carry no movement unchanged", () => {
    const trimmed: MetaShareEntry[] = [{ name: "c", share: 0.05, windowGames: 40 }];

    expect(settleAllNewShares(trimmed)).toBe(trimmed);
  });

  it("does not settle when a deck with movement is not new", () => {
    const mixed = [entry("a"), { name: "c", share: 0.05, windowGames: 40 }, entry("b", { isNew: false })];

    expect(settleAllNewShares(mixed)).toEqual(mixed);
  });
});

describe("hasMovement", () => {
  it("is true when every movement field is present", () => {
    expect(hasMovement(entry("a"))).toBe(true);
  });

  it("is false for a trimmed entry", () => {
    expect(hasMovement({ name: "c", share: 0.05, windowGames: 40 })).toBe(false);
  });

  it("is false when any movement field is missing", () => {
    expect(hasMovement({ ...entry("a"), firstSeen: undefined })).toBe(false);
  });
});
