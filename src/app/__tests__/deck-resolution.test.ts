import { describe, it, expect } from "vitest";
import { resolveDeckDetail, highestScoreAndStrength } from "../deck-resolution";
import type { PipelinePartialDeck } from "../../types/pipeline-data";
import rawCards from "../__fixtures__/cards-full-v510.json";
import { normaliseMultipleCards } from "../cards-api";

const cardsPayload = {
  cards: normaliseMultipleCards(rawCards as never),
  attacksByDeckBuilderNr: new Map(),
};
const cardsMapping = Object.fromEntries(
  cardsPayload.cards.map((c) => [c.id, c])
);

const matchupData: Record<string, never[]> = {};

const decksRaw: PipelinePartialDeck[] = [
  {
    name: "venusaur-a1-004",
    lists: [
      { cards: ["1:a1-004", "1:a1-219"], score: 10, strength: 5 },
      { cards: ["1:a1-219"], score: 2, strength: 1 },
    ],
    percentOfGames: 50,
    popularity: 100,
    score: 10,
  },
];

describe("resolveDeckDetail", () => {
  it("resolves the deck's best surviving list once a card is missing", () => {
    const result = resolveDeckDetail(
      decksRaw,
      matchupData,
      cardsPayload,
      cardsMapping,
      "venusaur-a1-004",
      { "a1-004": 2 }
    );
    expect(result?.extinct).toBe(false);
    expect(result?.deck.bestList.cards.some((c) => c.id === "a1-004")).toBe(
      false
    );
  });

  it("marks extinct and falls back to the full list when every list is unaffordable", () => {
    const decksAllShared = [
      { ...decksRaw[0], lists: [{ cards: ["2:a1-004"], score: 10, strength: 5 }] },
    ];
    const result = resolveDeckDetail(
      decksAllShared,
      matchupData,
      cardsPayload,
      cardsMapping,
      "venusaur-a1-004",
      { "a1-004": 2 }
    );
    expect(result?.extinct).toBe(true);
    expect(result?.deck.bestList.cards.some((c) => c.id === "a1-004")).toBe(
      true
    );
  });

  it("returns null for an unknown deck id", () => {
    expect(
      resolveDeckDetail(decksRaw, matchupData, cardsPayload, cardsMapping, "nope-a9-999", {})
    ).toBeNull();
  });

  it("keeps the matchup entries of the resolved deck", () => {
    const withMatchups: PipelinePartialDeck = { ...decksRaw[0] };
    const matchups = [{ name: "Total", totalGames: 100, winRate: 0.6 }];
    const result = resolveDeckDetail(
      [withMatchups],
      { "venusaur-a1-004": matchups },
      cardsPayload,
      cardsMapping,
      "venusaur-a1-004",
      {}
    );
    expect(result?.deck.matchups).toEqual(matchups);
  });
});

describe("highestScoreAndStrength", () => {
  it("scans every list of every deck, ignoring filters", () => {
    const { highestScore, highestStrength } =
      highestScoreAndStrength(decksRaw);
    expect(highestScore).toBe(10);
    expect(highestStrength).toBe(5);
  });
});

describe("card score display scale", () => {
  it("caps the best deck at 10 rather than exceeding the scale", () => {
    // deck.strength arrives from DecksContext already divided by
    // highestStrength, so the display must only multiply by 10. Dividing
    // again pushed the top deck to 11.8 on a 0 to 10 scale.
    const displayed = (strengthRatio: number) =>
      Number((strengthRatio * 10).toFixed(1));
    expect(displayed(1)).toBe(10);
    expect(displayed(0.5)).toBe(5);
  });
});
