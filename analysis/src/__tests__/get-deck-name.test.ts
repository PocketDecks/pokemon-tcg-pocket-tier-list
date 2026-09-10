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

// Regression pins from the PR 86 audit. Ranking `line` above row length let a
// 1-card anchored row beat a 2-card unanchored one, stripping the centrepiece
// from 93 deck names. Row length must decide first; `line` only separates
// rows that name the same number of cards.
//
// The bug needs two things at once: a 2-card pair worth keeping and a
// competing single card that anchors its own row (Dratini tops Dragonair,
// Litwick tops Chandelure). Without that third card the matcher has nothing
// to prefer the short row over, so the pair wins trivially and the pin cannot
// catch the regression. Each deck below carries the minimal anchor that
// flips it to the bare single card under the buggy ordering.
describe("row ranking: a fuller listing outranks an anchored shorter one", () => {
  it("keeps the Mega Rayquaza ex partner on a Dragonair deck", () => {
    const deck = mkDeck(
      [2, "Mega Rayquaza ex", "B4", "120"],
      [2, "Dragonair", "B4", "117"],
      [2, "Dratini", "A3b", "51"]
    );
    expect(getDeckName(deck)).toBe("mega-rayquaza-ex-b4-120&dragonair-b4-117");
  });

  it("keeps the Oricorio partner on a Chandelure deck", () => {
    const deck = mkDeck(
      [2, "Chandelure", "B2", "69"],
      [2, "Oricorio", "B4", "78"],
      [2, "Litwick", "B2", "67"]
    );
    expect(getDeckName(deck)).toBe("chandelure-b2-069&oricorio-b4-078");
  });

  it("still rejects a tech Basic row in favour of the real archetype", () => {
    // The fix this task preserves: Igglybuff is a 2-of tech Basic and must not
    // name a deck whose centrepiece is Mega Altaria ex. Swablu is in the deck
    // so Mega Altaria ex tops a line it plays and the row is anchored.
    const deck = mkDeck(
      [2, "Espeon", "B3a", "20"],
      [2, "Mega Altaria ex", "B1", "102"],
      [2, "Igglybuff", "A4a", "59"],
      [1, "Swablu", "B1", "196"]
    );
    expect(getDeckName(deck)).toBe("mega-altaria-ex-b1-102&espeon-b3a-020");
  });
});

// Containment: every card a row lists must be in the deck, checked against the
// full row and not the filtered supportedNames. The "Machoke Meowth" row names
// Machoke and Meowth. A deck holding Machoke and Persian (Meowth's evolution,
// not Meowth itself) must not take that row: outclassed() would drop Meowth
// from supportedNames and a check on supportedNames alone would pass it. With
// the row-level check it falls through to UNNAMED_DECK.
describe("containment: a row listing a card the deck lacks is rejected", () => {
  it("does not name a row after a card the deck does not play", () => {
    const deck = mkDeck(
      [2, "Machoke", "A1", "144"],
      [2, "Persian", "A1", "127"]
    );
    expect(getDeckName(deck)).toBe(UNNAMED_DECK);
  });
});
