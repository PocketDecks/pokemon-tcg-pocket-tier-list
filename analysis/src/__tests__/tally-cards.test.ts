import { tallyCards } from "../utils/tally-cards";
import { Card, Deck } from "../utils/types";

const makeDeck = (cards: Card[], winCount: number, totalGames: number): Deck => ({
  id: "deck",
  name: "Alpha",
  cards,
  pokemon: 0,
  differentPokemon: 0,
  winCount,
  lossCount: totalGames - winCount,
  totalGames,
  date: "2026-09-01T00:00:00.000Z",
  tournamentExPercent: 0.5,
  noTrainerPercent: 0,
  wins: [],
  losses: [],
});

describe("tallyCards", () => {
  it("sums wins and games per count-qualified card key", () => {
    const tally = tallyCards([
      makeDeck([{ name: "Pikachu ex", count: 2, set: "A1", number: "96" }], 6, 10),
      makeDeck([{ name: "Pikachu ex", count: 2, set: "A1", number: "96" }], 4, 10),
      makeDeck([{ name: "Pikachu ex", count: 1, set: "A1", number: "96" }], 3, 10),
    ]);
    expect(tally).toEqual({
      "2 Pikachu ex A1 96": { winCount: 10, totalGames: 20 },
      "1 Pikachu ex A1 96": { winCount: 3, totalGames: 10 },
    });
  });

  it("returns an empty tally for no decks", () => {
    expect(tallyCards([])).toEqual({});
  });
});
