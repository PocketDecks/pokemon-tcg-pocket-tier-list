import { describe, expect, it } from "vitest";
import { getSortValue } from "../sorting-helper";
import { SortBy } from "../../components/FilterContext";
import { FullDeckType, MatchupType } from "../../contexts/DecksContext";

const buildDeck = (overrides: Partial<FullDeckType>): FullDeckType =>
  ({
    id: "deck",
    name: "deck",
    lists: [],
    bestList: { cards: [], score: 0, strength: 0 },
    score: 1,
    popularity: 2,
    strength: 3,
    percentOfGames: 4,
    matchups: [],
    iconPrimary: null,
    iconSecondary: null,
    ...overrides,
  } as unknown as FullDeckType);

const matchup = (name: string, winRate: number): MatchupType => ({
  name,
  winRate,
  totalGames: 10,
});

describe("getSortValue", () => {
  it("reads the matching field for each sort option", () => {
    const deck = buildDeck({
      matchups: [matchup("Total", 55)],
    });

    expect(getSortValue(deck, SortBy.SCORE)).toBe(1);
    expect(getSortValue(deck, SortBy.POPULARITY)).toBe(2);
    expect(getSortValue(deck, SortBy.STRENGTH)).toBe(3);
    expect(getSortValue(deck, SortBy.WIN_RATE)).toBe(55);
  });

  it("picks the Total row rather than the first matchup", () => {
    const deck = buildDeck({
      matchups: [matchup("Pikachu ex", 90), matchup("Total", 48)],
    });

    expect(getSortValue(deck, SortBy.WIN_RATE)).toBe(48);
  });

  it("falls back to 0 when there is no Total row", () => {
    const deck = buildDeck({ matchups: [matchup("Pikachu ex", 90)] });

    expect(getSortValue(deck, SortBy.WIN_RATE)).toBe(0);
  });

  it("falls back to 0 when matchups are empty", () => {
    expect(getSortValue(buildDeck({ matchups: [] }), SortBy.WIN_RATE)).toBe(0);
  });

  it("returns 0 for an unrecognised sort option", () => {
    expect(getSortValue(buildDeck({}), "nonsense" as SortBy)).toBe(0);
  });
});

describe("getSortValue for the power metrics", () => {
  const deck = {
    powerScore: 72.5,
    metaScore: 61.25,
    freqScore: 50,
  } as unknown as Parameters<typeof getSortValue>[0];

  it("sorts on power score", () => {
    expect(getSortValue(deck, SortBy.POWER)).toBe(72.5);
  });

  it("sorts on meta score", () => {
    expect(getSortValue(deck, SortBy.META)).toBe(61.25);
  });

  it("sinks unranked decks to the bottom rather than treating null as zero-ish", () => {
    const unranked = {
      powerScore: null,
      metaScore: null,
      freqScore: 90,
    } as unknown as Parameters<typeof getSortValue>[0];
    expect(getSortValue(unranked, SortBy.POWER)).toBe(-1);
    expect(getSortValue(unranked, SortBy.META)).toBe(-1);
  });
});
