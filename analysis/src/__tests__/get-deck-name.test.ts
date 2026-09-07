import getDeckName from "../utils/get-deck-name";
import { Deck } from "../utils/types";

const mkDeck = (...cards: [number, string, string, string][]): Deck => ({
  id: "test-id",
  name: "Test Deck",
  cards: cards.map(([count, name, set, number]) => ({ count, name, set, number })),
  pokemon: cards.reduce((acc, [c]) => acc + c, 0),
  differentPokemon: cards.length,
  winCount: 0,
  lossCount: 0,
  totalGames: 0,
  date: "2024-03-20",
  tournamentExPercent: 0,
  noTrainerPercent: 0,
  wins: [],
  losses: [],
});

describe("getDeckName", () => {
  it("should return correct name for a deck with two main cards", () => {
    const deck = mkDeck([2, "Mimikyu ex", "B2", "73"], [2, "Giratina ex", "A2b", "35"]);
    const result = getDeckName(deck);
    expect(result).toBe("giratina-ex-a2b-035&mimikyu-ex-b2-073");
  });

  it("should return correct name for a deck with one main card", () => {
    const deck = mkDeck([2, "Magnezone", "A2", "53"]);
    const result = getDeckName(deck);
    expect(result).toBe("magnezone-a2-053");
  });

  it("should return correct name for a deck with one main card and one side card", () => {
    const deck = mkDeck([2, "Suicune ex", "A4a", "20"], [2, "Greninja", "A1", "89"]);
    const result = getDeckName(deck);
    expect(result).toBe("suicune-ex-a4a-020&greninja-a1-089");
  });

  it("should return null for a deck with no matching cards", () => {
    const deck = mkDeck([2, "Random Card", "A1", "1"]);
    const result = getDeckName(deck);
    expect(result).toBe("professor's-research-pa-007");
  });

  // Task 2: behaviour-preserving parity test. The leader must not depend on
  // card order or JSON insertion order; highest summed peakCountBySet wins.
  it("names a two-primary deck deterministically", () => {
    const deck = mkDeck([2, "Charizard ex", "A1", "36"], [2, "Greninja", "A1", "89"]);
    expect(getDeckName(deck)).toBe("charizard-ex-a1-036&greninja-a1-089");
    const reversed = mkDeck([2, "Greninja", "A1", "89"], [2, "Charizard ex", "A1", "36"]);
    expect(getDeckName(reversed)).toBe("charizard-ex-a1-036&greninja-a1-089");
  });

  // Equal-score tiebreak: when two mutual pairings score identically, the
  // selected pair's leader must stay in sync with its key, and the result
  // must not depend on input order.
  it("keeps bestKey in sync on an equal-score tiebreak", () => {
    const deck = mkDeck([2, "Hatterene", "B3", "71"], [2, "Meowstic", "B3", "66"]);
    const result = getDeckName(deck);
    expect(result).toBe("hatterene-b3-071&meowstic-b3-066");
    const reversed = mkDeck([2, "Meowstic", "B3", "66"], [2, "Hatterene", "B3", "71"]);
    expect(getDeckName(reversed)).toBe("hatterene-b3-071&meowstic-b3-066");
  });

  // Task 2 decision 2: seeded archetypes not present on Limitless.
  it("names the seeded Oricorio A3 66 archetype", () => {
    const deck = mkDeck([2, "Oricorio", "A3", "66"]);
    expect(getDeckName(deck)).toBe("oricorio-a3-066");
  });

  it("names the seeded Puppy-Loving Girl B3b 67 archetype", () => {
    const deck = mkDeck([2, "Puppy-Loving Girl", "B3b", "67"]);
    expect(getDeckName(deck)).toBe("puppy-loving-girl-b3b-067");
  });

  it("names the seeded Gigalith ex A2 94 archetype", () => {
    const deck = mkDeck([2, "Gigalith ex", "A2", "94"]);
    expect(getDeckName(deck)).toBe("gigalith-ex-a2-094");
  });
});
