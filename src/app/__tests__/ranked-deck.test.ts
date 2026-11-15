import { describe, expect, it } from "vitest";
import { comparePowerDescending, isRanked, rankedDecks, sortRanked } from "../ranked-deck";

const decks = [
  { name: "a", powerScore: 40 },
  { name: "b", powerScore: null },
  { name: "c", powerScore: 70 },
  { name: "d", powerScore: 0 },
];

describe("ranked decks", () => {
  it("treats a deck with a power score of 0 as ranked", () => {
    expect(decks.filter(isRanked).map((deck) => deck.name)).toEqual(["a", "c", "d"]);
    expect(rankedDecks(decks)).toHaveLength(3);
  });

  it("sorts ranked decks by power score, highest first", () => {
    expect(sortRanked(rankedDecks(decks)).map((deck) => deck.name)).toEqual(["c", "a", "d"]);
  });

  it("sinks unranked decks below every ranked deck, even one scoring 0", () => {
    expect([...decks].sort(comparePowerDescending).map((deck) => deck.name)).toEqual([
      "c",
      "a",
      "d",
      "b",
    ]);
  });
});
