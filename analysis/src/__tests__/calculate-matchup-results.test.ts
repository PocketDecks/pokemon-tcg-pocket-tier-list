import { calculateMatchupResults } from "../utils/calculate-matchup-results";
import { Deck } from "../utils/types";

describe("calculateMatchupResults", () => {
  it("should calculate matchup results correctly", () => {
    const mockDecks: Deck[] = [
      {
        id: "test-1",
        name: "Test Deck",
        cards: [],
        pokemon: 0,
        differentPokemon: 0,
        winCount: 1,
        lossCount: 1,
        totalGames: 2,
        date: "2024-01-01",
        tournamentExPercent: 0,
        noTrainerPercent: 0,
        wins: ["Opponent1"],
        losses: ["Opponent2"],
      },
      {
        id: "test-2",
        name: "Test Deck",
        cards: [],
        pokemon: 0,
        differentPokemon: 0,
        winCount: 1,
        lossCount: 0,
        totalGames: 1,
        date: "2024-01-01",
        tournamentExPercent: 0,
        noTrainerPercent: 0,
        wins: ["Opponent2"],
        losses: [],
      },
    ];

    const result = calculateMatchupResults(mockDecks, "Test Deck");

    expect(result["Opponent1"].wins).toBe(1);
    expect(result["Opponent1"].losses).toBe(0);
    expect(result["Opponent2"].wins).toBe(1);
    expect(result["Opponent2"].losses).toBe(1);
  });

  it("counts every game once, whatever the deck's date", () => {
    // Two same-archetype decks face Foe: one at 1-1, one at 1-0. The recency
    // ramp is retired, so the tally is the raw count regardless of date.
    const mockDecks: Deck[] = [
      {
        id: "old",
        name: "Test Deck",
        cards: [],
        pokemon: 0,
        differentPokemon: 0,
        winCount: 1,
        lossCount: 1,
        totalGames: 2,
        date: "2024-01-01",
        tournamentExPercent: 0,
        noTrainerPercent: 0,
        wins: ["Foe"],
        losses: ["Foe"],
      },
      {
        id: "new",
        name: "Test Deck",
        cards: [],
        pokemon: 0,
        differentPokemon: 0,
        winCount: 1,
        lossCount: 0,
        totalGames: 1,
        date: "2024-02-01",
        tournamentExPercent: 0,
        noTrainerPercent: 0,
        wins: ["Foe"],
        losses: [],
      },
    ];

    const result = calculateMatchupResults(mockDecks, "Test Deck");

    expect(result["Foe"].wins).toBe(2);
    expect(result["Foe"].losses).toBe(1);
  });
});

describe("calculateMatchupResults scope", () => {
  const base: Deck = {
    id: "mine",
    name: "Mine",
    cards: [],
    pokemon: 0,
    differentPokemon: 0,
    winCount: 1,
    lossCount: 0,
    totalGames: 1,
    date: "2024-01-01",
    tournamentExPercent: 0,
    noTrainerPercent: 0,
    wins: ["Foe"],
    losses: [],
  };

  it("ignores decks of other archetypes", () => {
    const theirs: Deck = { ...base, id: "theirs", name: "Theirs", wins: ["Foe", "Foe"], losses: ["Other"] };
    expect(calculateMatchupResults([base, theirs], "Mine")).toEqual({ Foe: { wins: 1, losses: 0 } });
  });

  it("returns nothing for an empty list or an empty archetype name", () => {
    expect(calculateMatchupResults([], "Mine")).toEqual({});
    expect(calculateMatchupResults([base], "")).toEqual({});
  });

  // The filter below returns nothing for these inputs anyway, so the cases
  // above pass with or without the guard. This one does not: a deck whose own
  // name is blank would match an empty query, and the guard is what stops it.
  it("refuses an empty archetype name even when a deck is named blank", () => {
    const blank: Deck = { ...base, id: "blank", name: "", wins: ["Foe"], losses: [] };
    expect(calculateMatchupResults([blank], "")).toEqual({});
  });
});
