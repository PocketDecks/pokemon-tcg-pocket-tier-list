import getId from "../utils/get-id";
import { Card, Deck } from "../utils/types";

const pikachu: Card = { name: "Pikachu", count: 4, set: "base", number: "58" };
const charizard: Card = { name: "Charizard ex", count: 2, set: "base", number: "12" };

const makeDeck = (cards: Card[], overrides: Partial<Deck> = {}): Deck => ({
  id: "test-id",
  name: "Test Deck",
  cards,
  pokemon: 0,
  differentPokemon: 0,
  winCount: 0,
  lossCount: 0,
  totalGames: 0,
  date: "2024-03-20",
  tournamentExPercent: 0,
  noTrainerPercent: 0,
  wins: [],
  losses: [],
  ...overrides,
});

describe("getId", () => {
  it("is stable for the same deck", () => {
    const deck = makeDeck([pikachu, charizard]);
    expect(getId(deck)).toBe(getId(deck));
  });

  it("ignores the order of the cards", () => {
    expect(getId(makeDeck([pikachu, charizard]))).toBe(getId(makeDeck([charizard, pikachu])));
  });

  it("hashes the card list and nothing else", () => {
    const base = makeDeck([pikachu, charizard]);
    const other = makeDeck([pikachu, charizard], {
      id: "another-id",
      name: "Another Name",
      winCount: 9,
      totalGames: 30,
      date: "2026-01-01",
    });
    expect(getId(other)).toBe(getId(base));
  });

  it("changes when only a copy count changes", () => {
    expect(getId(makeDeck([pikachu]))).not.toBe(getId(makeDeck([{ ...pikachu, count: 3 }])));
  });

  it("changes when only the set or the number changes", () => {
    expect(getId(makeDeck([pikachu]))).not.toBe(getId(makeDeck([{ ...pikachu, set: "A1" }])));
    expect(getId(makeDeck([pikachu]))).not.toBe(getId(makeDeck([{ ...pikachu, number: "59" }])));
  });

  it("does not mutate the deck it hashes", () => {
    const deck = makeDeck([pikachu, charizard]);
    getId(deck);
    expect(deck.cards).toEqual([pikachu, charizard]);
  });
});
