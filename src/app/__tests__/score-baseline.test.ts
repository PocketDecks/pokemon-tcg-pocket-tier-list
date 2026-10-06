import { describe, expect, it } from "vitest";
import {
  getScoreBaseline,
  relativeToBaseline,
  sortByPowerScore,
} from "../score-baseline";

const deck = (
  name: string,
  powerScore: number | null,
  score: number,
  strength: number
) => ({
  name,
  powerScore,
  lists: [{ score, strength }],
});

describe("score baseline", () => {
  it("sorts decks by Power Score without mutating the input", () => {
    const decks = [
      deck("lower", 80, 0.5, 0.5),
      deck("leader", 100, 0.6, 0.6),
    ];

    expect(sortByPowerScore(decks).map((item) => item.name)).toEqual([
      "leader",
      "lower",
    ]);
    expect(decks.map((item) => item.name)).toEqual(["lower", "leader"]);
  });

  it("uses the Power Score leader instead of the composite-score leader", () => {
    expect(
      getScoreBaseline([
        deck("composite-leader", 90, 0.9, 0.8),
        deck("tier-leader", 100, 0.6, 0.7),
        deck("unranked", null, 1, 1),
      ])
    ).toEqual({
      deckName: "tier-leader",
      powerScore: 100,
      cardStrength: 0.7,
    });
  });

  it("returns a relative score against the supplied baseline", () => {
    expect(relativeToBaseline(75, 100)).toBe(0.75);
    expect(relativeToBaseline(75, 0)).toBe(0);
  });
});
