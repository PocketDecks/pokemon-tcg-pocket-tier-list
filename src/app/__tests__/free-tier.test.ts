import { describe, expect, it } from "vitest";
import { FREE_DECK_LIMIT, freeDeckNames } from "../free-tier";
import { sortByPowerScore } from "../score-baseline";

const deck = (name: string, powerScore: number | null) => ({ name, powerScore });

const field = (count: number) =>
  Array.from({ length: count }, (_, index) => deck(`deck-${index}`, 100 - index));

describe("free tier", () => {
  it("limits the free decks to ten", () => {
    expect(FREE_DECK_LIMIT).toBe(10);
  });

  it("names the ten decks with the highest Power Score", () => {
    const names = freeDeckNames(field(15));

    expect(names.size).toBe(10);
    expect([...names].sort()).toEqual(
      Array.from({ length: 10 }, (_, index) => `deck-${index}`).sort()
    );
  });

  it("agrees with the ranking the statistics matrix uses", () => {
    const decks = [...field(14)].reverse();
    const expected = sortByPowerScore(decks)
      .slice(0, FREE_DECK_LIMIT)
      .map((entry) => entry.name);

    expect([...freeDeckNames(decks)].sort()).toEqual([...expected].sort());
  });

  it("ranks unscored decks last", () => {
    const decks = [deck("unscored", null), ...field(10)];

    expect(freeDeckNames(decks).has("unscored")).toBe(false);
  });

  it("names every deck when the field has fewer than ten", () => {
    expect([...freeDeckNames(field(4))].sort()).toEqual([
      "deck-0",
      "deck-1",
      "deck-2",
      "deck-3",
    ]);
  });

  it("does not reorder its input", () => {
    const decks = [...field(12)].reverse();
    const before = decks.map((entry) => entry.name);

    freeDeckNames(decks);

    expect(decks.map((entry) => entry.name)).toEqual(before);
  });
});
