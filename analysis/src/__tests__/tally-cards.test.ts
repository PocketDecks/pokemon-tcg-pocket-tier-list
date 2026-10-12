import cardToString, { cardIdentity } from "../utils/card-to-string";
import { calculateDeckScore } from "../utils/calculate-deck-score";
import { modalCopies, tallyCards } from "../utils/tally-cards";
import { Card, Deck } from "../utils/types";

const WEIGHTS = { winrateImportance: 0.6, popularityImportance: 0.4 };

const card = (name: string, count: number, set = "A1", number = "1"): Card => ({
  name,
  count,
  set,
  number,
});

const makeDeck = (cards: Card[], winCount: number, totalGames: number): Deck => ({
  id: "d",
  name: "Deck",
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

describe("cardIdentity", () => {
  it("omits the copy count and maps promo set codes", () => {
    expect(cardIdentity(card("Pikachu ex", 2, "A1", "96"))).toBe("Pikachu ex A1 96");
    expect(cardIdentity(card("Potion", 1, "P-A", "1"))).toBe("Potion PA 1");
    expect(cardIdentity(card("Potion", 1, "P-B", "1"))).toBe("Potion PB 1");
  });

  it("keeps cardToString as the count followed by the identity", () => {
    const sample = card("Pikachu ex", 2, "A1", "96");
    expect(cardToString(sample)).toBe(`2 ${cardIdentity(sample)}`);
  });

  it("still validates the count before the identity", () => {
    expect(() => cardToString({ ...card("X", 1), count: -1 })).toThrow("Invalid card count");
    expect(() => cardToString({ ...card("", 1) })).toThrow("Card name is required");
    expect(() => cardIdentity({ ...card("X", 1), number: " " })).toThrow("Card number is required");
  });
});

describe("tallyCards", () => {
  it("merges copy counts of one card into one identity", () => {
    const tally = tallyCards([
      makeDeck([card("Pikachu ex", 2)], 6, 10),
      makeDeck([card("Pikachu ex", 1)], 3, 10),
      makeDeck([card("Mew", 2)], 5, 10),
    ]);
    expect(Object.keys(tally).sort()).toEqual(["Mew A1 1", "Pikachu ex A1 1"]);
    expect(tally["Pikachu ex A1 1"]).toEqual({
      winCount: 9,
      totalGames: 20,
      copies: { 1: 10, 2: 10 },
    });
  });

  it("does not leak games from decks that lack the card", () => {
    const tally = tallyCards([
      makeDeck([card("Mew", 2)], 5, 10),
      makeDeck([card("Pikachu ex", 2)], 1, 30),
    ]);
    expect(tally["Mew A1 1"].totalGames).toBe(10);
  });
});

describe("modalCopies", () => {
  it("returns the copy count with the most games", () => {
    expect(modalCopies({ winCount: 0, totalGames: 0, copies: { 1: 5, 2: 40, 3: 10 } })).toBe(2);
  });

  it("prefers the lower count on a tie", () => {
    expect(modalCopies({ winCount: 0, totalGames: 0, copies: { 2: 10, 1: 10 } })).toBe(1);
  });

  // Integer-like keys enumerate ascending, so the lower count is always seen
  // first and the branch never runs. A fractional count lands after the
  // integer, so the tie is decided by the rule under test.
  it("prefers the lower count when a fractional count ties with a whole one", () => {
    expect(modalCopies({ winCount: 0, totalGames: 0, copies: { 2: 10, 1.5: 10 } })).toBe(1.5);
  });

  it("returns 0 for a card with no recorded copies", () => {
    expect(modalCopies({ winCount: 0, totalGames: 0, copies: {} })).toBe(0);
  });
});

describe("calculateDeckScore keyed by identity", () => {
  it("multiplies each identity score by the copies the deck runs", () => {
    const deck = makeDeck([card("Pikachu ex", 2), card("Mew", 1)], 6, 10);
    const stats = {
      "Pikachu ex A1 1": { winCount: 6, totalGames: 10, score: 0.5 },
      "Mew A1 1": { winCount: 6, totalGames: 10, score: 0.2 },
    };
    const result = calculateDeckScore(deck, stats, 10, 100, WEIGHTS);
    expect(result.strength).toBeCloseTo((0.5 * 2 + 0.2 * 1) / 20, 12);
  });
});
