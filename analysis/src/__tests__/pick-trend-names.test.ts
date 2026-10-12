import { PipelinePartialDeck } from "../../../src/types/pipeline-data";
import { pickTrendNames } from "../utils/build-trends";

const makeArchetype = (
  name: string,
  score: number,
  powerScore: number | null
): PipelinePartialDeck => ({
  name,
  lists: [],
  popularity: 0.1,
  percentOfGames: 0.1,
  score,
  expectedWinRate: 0.5,
  fieldCoverage: powerScore === null ? 0 : 0.9,
  powerScore,
  freqScore: 0,
  metaScore: powerScore,
});

describe("pickTrendNames", () => {
  it("orders by Power Score, not by composite score", () => {
    const decks = [
      makeArchetype("High score, low power", 0.9, 40),
      makeArchetype("Low score, high power", 0.1, 90),
    ];
    expect(pickTrendNames(decks, 2)).toEqual(["Low score, high power", "High score, low power"]);
  });

  it("never picks an unranked archetype", () => {
    const decks = [
      makeArchetype("Unranked favourite", 0.99, null),
      makeArchetype("Ranked", 0.2, 55),
    ];
    expect(pickTrendNames(decks, 6)).toEqual(["Ranked"]);
  });

  it("breaks Power Score ties by composite score, then by name", () => {
    const decks = [
      makeArchetype("Beta", 0.5, 70),
      makeArchetype("Alpha", 0.5, 70),
      makeArchetype("Gamma", 0.8, 70),
    ];
    expect(pickTrendNames(decks, 3)).toEqual(["Gamma", "Alpha", "Beta"]);
  });

  it("returns at most the requested count and leaves the input order alone", () => {
    const decks = Array.from({ length: 10 }, (_, index) =>
      makeArchetype(`deck-${index}`, 0.1, index)
    );
    const snapshot = decks.map((deck) => deck.name);
    expect(pickTrendNames(decks)).toEqual(["deck-9", "deck-8", "deck-7", "deck-6", "deck-5", "deck-4"]);
    expect(decks.map((deck) => deck.name)).toEqual(snapshot);
  });

  it("returns nothing when no archetype is ranked", () => {
    expect(pickTrendNames([makeArchetype("A", 0.5, null)])).toEqual([]);
  });
});
