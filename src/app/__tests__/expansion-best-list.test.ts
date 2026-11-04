import { describe, expect, it } from "vitest";
import expansions from "pokemon-tcg-pocket-cards/data/v5/expansions.min.json";
import decks from "../../../public/data/best-decks.json";
import { bestListCards, coveredCardIdsBySet } from "../expansion-feed.mjs";
import { expansionIndexPolicy } from "../expansion-index-policy.mjs";

describe("best-list card derivation", () => {
  it("takes the highest-scoring list and keeps the earlier list on a tie", () => {
    const deck = {
      lists: [
        { score: 0.5, cards: ["1:c1-001"] },
        { score: 0.9, cards: ["1:c1-002"] },
        { score: 0.9, cards: ["1:c1-003"] },
      ],
    };
    expect(bestListCards(deck)).toEqual(["1:c1-002"]);
  });

  it("does not count a card that appears only in a non-best list", () => {
    const decks = [{ lists: [{ score: 1, cards: ["1:c1-001"] }, { score: 0.2, cards: ["1:a1-123"] }] }];
    expect(coveredCardIdsBySet(decks).get("a1")).toBeUndefined();
    expect(expansionIndexPolicy(expansions, decks).isIndexable("c1")).toBe(false);
  });

  it("keeps Gengar ex out of A1's used cards in the shipped data", () => {
    const a1 = coveredCardIdsBySet(decks).get("a1") ?? new Set();
    expect(a1.has("a1-123")).toBe(false);
  });

  it("keeps C1 indexable in the shipped data", () => {
    const result = expansionIndexPolicy(expansions, decks);
    expect(result.isIndexable("c1")).toBe(true);
    expect(coveredCardIdsBySet(decks).get("c1")?.size).toBeGreaterThanOrEqual(5);
  });
});
