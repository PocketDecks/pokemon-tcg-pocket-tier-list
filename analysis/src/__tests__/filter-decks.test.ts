import { filterDecks } from "../utils/filter-decks";
import { Deck } from "../utils/types";
import { vi } from "vitest";

vi.mock(import("../settings"), async (importOriginal) => ({
  ...(await importOriginal()),
  NOEX_PERCENT_CUTOFF: 0.2,
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
    tournamentExPercent: 0.5,
    noTrainerPercent: 0,
    wins: [],
    losses: [],
    name: "Test Deck",
  };

  it("keeps an ordinary deck", () => {
    expect(filterDecks([mockDeck])).toHaveLength(1);
  });

  it("drops decks dated before the expansion release", () => {
    const old: Deck = { ...mockDeck, date: "2019-12-31T23:59:59.999Z" };
    const onRelease: Deck = { ...mockDeck, date: "2020-01-01T00:00:00.000Z" };
    expect(filterDecks([old, onRelease])).toEqual([onRelease]);
  });

  it("drops decks from tournaments with too few ex decks and keeps the boundary", () => {
    const below: Deck = { ...mockDeck, id: "below", tournamentExPercent: 0.19 };
    const atCutoff: Deck = { ...mockDeck, id: "at", tournamentExPercent: 0.2 };
    expect(filterDecks([below, atCutoff]).map((deck) => deck.id)).toEqual(["at"]);
  });

  it("drops decks from tournaments where too many decks run no trainers", () => {
    const atCutoff: Deck = { ...mockDeck, id: "at", noTrainerPercent: 0.1 };
    const below: Deck = { ...mockDeck, id: "below", noTrainerPercent: 0.09 };
    expect(filterDecks([atCutoff, below]).map((deck) => deck.id)).toEqual(["below"]);
  });

  it("drops decks made only of A1 and promo cards", () => {
    const onlyOld: Deck = {
      ...mockDeck,
      id: "old",
      cards: [
        { name: "Pikachu", count: 1, set: "A1", number: "1" },
        { name: "Potion", count: 1, set: "P-A", number: "1" },
        { name: "Hand", count: 1, set: "P-B", number: "1" },
      ],
    };
    expect(filterDecks([onlyOld, mockDeck]).map((deck) => deck.id)).toEqual(["test-id"]);
  });

  it("returns the newest decks first", () => {
    const older: Deck = { ...mockDeck, id: "older", date: "2025-01-01T00:00:00.000Z" };
    const newer: Deck = { ...mockDeck, id: "newer", date: "2026-01-01T00:00:00.000Z" };
    expect(filterDecks([older, newer]).map((deck) => deck.id)).toEqual(["newer", "older"]);
  });
});
