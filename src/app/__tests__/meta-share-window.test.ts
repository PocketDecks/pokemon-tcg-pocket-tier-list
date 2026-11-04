import { describe, expect, it } from "vitest";
import { settleAllNewShares } from "../meta-share-window";
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
});
