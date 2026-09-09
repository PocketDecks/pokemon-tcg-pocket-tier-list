import decks from "../data/limitless-decks.json";
import getDeckName from "../utils/get-deck-name";
import { canonSet, cardKey, SET_CODES, SET_CODE_PATTERN, STANDARD_SET_CODES } from "../utils/set-codes";
import { resolveSlug } from "../utils/slug-cards";
import { DeckListingStore } from "../utils/deck-listing-store";
import { Deck } from "../utils/types";

// The live listing store's own shape, imported rather than redeclared: a
// hand-maintained copy of a pipeline shape has drifted out of step here before.
const deckStore = (decks as unknown as DeckListingStore).sets;

// Derive a pairing key for every card across the live listing store, resolving
// each row slug through the canonical card index so the verified keys track
// what ships now rather than a frozen snapshot.
const pairingKeys = new Set<string>();
for (const deckSet of Object.values(deckStore)) {
  for (const listing of deckSet.decks) {
    for (const card of resolveSlug(listing.slug)) {
      pairingKeys.add(cardKey(card.name, card.set, card.number));
    }
  }
}
const STORE_KEYS = [...pairingKeys];

// Every shipped key is "Name SET N". Split off the trailing number and set so
// the normaliser can be asked to rebuild the key and prove it round-trips.
const splitKey = (key: string): { name: string; set: string; number: string } => {
  const parts = key.split(" ");
  const number = parts.pop() ?? "";
  const set = parts.pop() ?? "";
  return { name: parts.join(" "), set, number };
};

const storeSetCodes = new Set<string>();
for (const key of STORE_KEYS) {
  const { set } = splitKey(key);
  if (set) storeSetCodes.add(set);
}

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

describe("canonSet", () => {
  it("folds case and promo spellings to the store form", () => {
    expect(canonSet("A1")).toBe("A1");
    expect(canonSet("a1")).toBe("A1");
    expect(canonSet("A2b")).toBe("A2b");
    expect(canonSet("a2b")).toBe("A2b");
    expect(canonSet("A2B")).toBe("A2b");
    expect(canonSet("B4a")).toBe("B4a");
    expect(canonSet("b4a")).toBe("B4a");
    expect(canonSet("PA")).toBe("PA");
    expect(canonSet("pa")).toBe("PA");
    expect(canonSet("P-A")).toBe("PA");
    expect(canonSet("P-B")).toBe("PB");
    expect(canonSet("PB")).toBe("PB");
    expect(canonSet("pb")).toBe("PB");
    // A4b is a real reprint set, kept canonical even though the scraper folds
    // its cards onto an earlier printing.
    expect(canonSet("A4b")).toBe("A4b");
    expect(canonSet("a4b")).toBe("A4b");
  });

  it("keeps every set code already stored stable", () => {
    for (const set of storeSetCodes) {
      expect(canonSet(set)).toBe(set);
    }
  });
});

describe("cardKey", () => {
  it("builds the pairing key from canonical and raw parts", () => {
    expect(cardKey("Greninja", "A1", "89")).toBe("Greninja A1 89");
    expect(cardKey("Greninja", "a1", "89")).toBe("Greninja A1 89");
    expect(cardKey("Team Rocket's Raticate ex", "b4a", "59")).toBe(
      "Team Rocket's Raticate ex B4a 59"
    );
    expect(cardKey("Lapras ex", "P-A", "14")).toBe("Lapras ex PA 14");
  });

  it("rebuilds every shipped pairing key unchanged", () => {
    expect(STORE_KEYS.length).toBeGreaterThan(0);
    console.log(
      `derived ${STORE_KEYS.length} card keys from ${storeSetCodes.size} distinct set codes`
    );
    for (const key of STORE_KEYS) {
      const { name, set, number } = splitKey(key);
      expect(cardKey(name, set, number)).toBe(key);
    }
  });
});

describe("deck naming parity over the listing store", () => {
  // Characterisation snapshot: these names were captured from the matcher
  // against the per-set Limitless listings. They must regenerate identically,
  // or a normaliser change has corrupted a deck name. Cards that appear only as
  // a partner on Limitless (Cresselia ex, Team Rocket's Weezing ex, Milotic ex)
  // have no listing row of their own and fall to UNNAMED_DECK by design.
  const cases: [string, [number, string, string, string][]][] = [
    ["lapras-ex-pa-014", [[2, "Lapras ex", "P-A", "14"]]],
    ["mega-pidgeot-ex-pb-006", [[2, "Mega Pidgeot ex", "P-B", "6"]]],
    ["mega-pidgeot-ex-pb-006", [[2, "Mega Pidgeot ex", "PB", "6"]]],
    ["charizard-ex-a2b-010&greninja-a1-089", [[2, "Charizard ex", "A1", "36"], [2, "Greninja", "A1", "89"]]],
    ["suicune-ex-a4a-020&greninja-a1-089", [[2, "Suicune ex", "A4a", "20"], [2, "Greninja", "A1", "89"]]],
    ["giratina-ex-a2b-035&mimikyu-ex-b2-073", [[2, "Giratina ex", "A2b", "35"], [2, "Mimikyu ex", "B2", "73"]]],
    ["magnezone-b1a-026", [[2, "Magnezone", "A2", "53"]]],
  ];

  it.each(cases)("names %s identically", (expected, rows) => {
    expect(getDeckName(mkDeck(...rows))).toBe(expected);
  });
});

describe("SET_CODES is the single enumeration", () => {
  it("covers every set code present in the shipped store", () => {
    for (const set of storeSetCodes) {
      expect(SET_CODES).toContain(set);
    }
  });

  it("keeps the standard sets as a prefix of the full list", () => {
    expect(SET_CODES.slice(0, STANDARD_SET_CODES.length)).toEqual([
      ...STANDARD_SET_CODES,
    ]);
  });

  it("orders the token pattern longest-first so variants win the match", () => {
    const re = new RegExp(`^(?:${SET_CODE_PATTERN})`, "i");
    expect("a1a-something".match(re)?.[0]).toBe("a1a");
    expect("a2b-something".match(re)?.[0]).toBe("a2b");
    expect("p-a-something".match(re)?.[0]).toBe("p-a");
  });
});

describe("canonSet rejects codes outside the enumeration", () => {
  it("throws rather than silently upper-casing an unknown code", () => {
    expect(() => canonSet("Z9")).toThrow("unknown set code");
    expect(() => canonSet("")).toThrow("unknown set code");
  });

  it("still folds every known spelling", () => {
    for (const code of SET_CODES) {
      expect(canonSet(code.toLowerCase())).toBe(code);
      expect(canonSet(code.toUpperCase())).toBe(code);
    }
  });
});
