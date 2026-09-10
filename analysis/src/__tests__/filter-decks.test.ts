import { filterDecks } from "../utils/filter-decks";
import { Deck } from "../utils/types";
import { vi } from "vitest";

vi.mock(import("../settings"), async (importOriginal) => ({
  ...(await importOriginal()),
  NOEX: true,
  NOEX_PERCENT_CUTOFF: 0.2,
  WIGGLYTUFF_PERCENT_CUTOFF: 0.1,
  NO_TRAINER_PERCENT_CUTOFF: 0.1,
  EXPANSION_RELEASE_DATE: new Date("2020-01-01"),
}));

describe("filterDecks", () => {
  const mockDeck: Deck = {
    id: "test-id",
    cards: [{ name: "Charizard", count: 1, set: "SVI", number: "1" }],
    pokemon: 0,
    differentPokemon: 0,
    winCount: 0,
    lossCount: 0,
    totalGames: 0,
    date: new Date().toISOString(),
    tournamentExPercent: 0,
    noTrainerPercent: 0,
    wins: [],
    losses: [],
    name: "Test Deck",
  };

  it("should filter out decks with ex cards when NOEX is true", () => {
    const deckWithEx: Deck = {
      ...mockDeck,
      cards: [{ name: "Charizard ex", count: 1, set: "SVI", number: "1" }],
    };
    const deckWithoutEx: Deck = {
      ...mockDeck,
      cards: [{ name: "Charizard", count: 1, set: "SVI", number: "1" }],
    };
    const decks = [deckWithEx, deckWithoutEx];
    const result = filterDecks(decks);
    expect(result).toHaveLength(1);
    expect(result[0].cards[0].name).toBe("Charizard");
  });

  it("should filter out decks with high tournament ex percent when NOEX is true", () => {
    const deckWithHighExPercent: Deck = {
      ...mockDeck,
      tournamentExPercent: 0.3,
    };
    const deckWithLowExPercent: Deck = {
      ...mockDeck,
      tournamentExPercent: 0.1,
    };
    const decks = [deckWithHighExPercent, deckWithLowExPercent];
    const result = filterDecks(decks);
    expect(result).toHaveLength(1);
    expect(result[0].tournamentExPercent).toBe(0.1);
  });

  it("should filter out decks with high no trainer percent", () => {
    const deckWithHighNoTrainer: Deck = {
      ...mockDeck,
      noTrainerPercent: 0.2,
    };
    const deckWithLowNoTrainer: Deck = {
      ...mockDeck,
      noTrainerPercent: 0.05,
    };
    const decks = [deckWithHighNoTrainer, deckWithLowNoTrainer];
    const result = filterDecks(decks);
    expect(result).toHaveLength(1);
    expect(result[0].noTrainerPercent).toBe(0.05);
  });
});
