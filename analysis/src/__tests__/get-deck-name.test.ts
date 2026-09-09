import getDeckName, { UNNAMED_DECK } from "../utils/get-deck-name";
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
  it("matches a deck to the newest-set listing that names all its cards", () => {
    // Magnezone A2 53 + Miraidon ex B3a 19 must match the B3a
    // "Magnezone Miraidon" row, keeping both cards, not a Magnezone-only row.
    const deck = mkDeck([2, "Magnezone", "A2", "53"], [2, "Miraidon ex", "B3a", "19"]);
    expect(getDeckName(deck)).toBe("miraidon-ex-b3a-019&magnezone-b1a-026");
  });

  it("keeps the partner in the name instead of folding it into the primary", () => {
    // Charizard ex A2b 10 + Entei ex A4a 10 must keep Entei, not name the deck
    // after Charizard ex alone.
    const deck = mkDeck([2, "Charizard ex", "A2b", "10"], [2, "Entei ex", "A4a", "10"]);
    expect(getDeckName(deck)).toBe("charizard-ex-a1-036&entei-ex-a4a-010");
  });

  it("falls back to the unnamed-deck sentinel when nothing matches", () => {
    const deck = mkDeck([2, "Random Card", "A1", "1"]);
    expect(getDeckName(deck)).toBe(UNNAMED_DECK);
  });

  it("matches a single-card listing", () => {
    const deck = mkDeck([2, "Magnezone", "A2", "53"]);
    expect(getDeckName(deck)).toBe("magnezone-b1a-026");
  });

  it("names a two-card deck deterministically regardless of input order", () => {
    const a = mkDeck([2, "Charizard ex", "A2b", "10"], [2, "Entei ex", "A4a", "10"]);
    const b = mkDeck([2, "Entei ex", "A4a", "10"], [2, "Charizard ex", "A2b", "10"]);
    expect(getDeckName(a)).toBe(getDeckName(b));
  });

  // Task 2: seeded archetypes not present on Limitless.
  it("names the seeded Oricorio A3 66 archetype", () => {
    const deck = mkDeck([2, "Oricorio", "A3", "66"]);
    expect(getDeckName(deck)).toBe("oricorio-a3-034");
  });

  it("names the seeded Puppy-Loving Girl B3b 67 archetype", () => {
    const deck = mkDeck([2, "Puppy-Loving Girl", "B3b", "67"]);
    expect(getDeckName(deck)).toBe("puppy-loving-girl-b3b-067");
  });

  it("names the seeded Gigalith ex A2 94 archetype", () => {
    const deck = mkDeck([2, "Gigalith ex", "A2", "94"]);
    expect(getDeckName(deck)).toBe("gigalith-ex-b2-087");
  });

  // Seeds are a last resort: when a partner gives the deck a real listing, that
  // listing names it instead of the seed.
  it("prefers a matching listing over the seed when a partner is present", () => {
    const deck = mkDeck([2, "Oricorio", "A3", "66"], [2, "Greninja", "A1", "89"]);
    expect(getDeckName(deck)).toBe("greninja-a1-089&oricorio-a3-034");
  });

  // A seeded archetype still names the deck against a partner that yields no
  // listing, so the archetype does not vanish into UNNAMED_DECK.
  it("keeps a seeded archetype when the partner matches no listing", () => {
    const deck = mkDeck([2, "Puppy-Loving Girl", "B3b", "67"], [2, "Lickitung", "A1", "117"]);
    expect(getDeckName(deck)).toBe("puppy-loving-girl-b3b-067");
  });
});
