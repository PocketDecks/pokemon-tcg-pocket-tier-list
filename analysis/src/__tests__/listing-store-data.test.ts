import decks from "../data/limitless-decks.json";
import getDeckName from "../utils/get-deck-name";
import { canonSet, cardKey, SET_CODES } from "../utils/set-codes";
import { resolveSlug } from "../utils/slug-cards";
import { DeckListingStore } from "../utils/deck-listing-store";
import { Deck } from "../utils/types";

const deckStore = (decks as unknown as DeckListingStore).sets;

const unresolved: string[] = [];
const pairingKeys = new Set<string>();
for (const [set, deckSet] of Object.entries(deckStore)) {
  for (const listing of deckSet.decks) {
    const cards = resolveSlug(listing.slug);
    if (cards.length === 0) {
      unresolved.push(`${set}:${listing.slug}`);
    }
    for (const card of cards) {
      pairingKeys.add(cardKey(card.name, card.set, card.number));
    }
  }
}
const STORE_KEYS = [...pairingKeys];

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

describe("the shipped listing store", () => {
  it("holds rows, and every row resolves to cards", () => {
    expect(Object.values(deckStore).some((set) => set.decks.length > 0)).toBe(true);
    expect(unresolved).toEqual([]);
  });

  it("uses only set codes the enumeration knows, each already canonical", () => {
    expect(storeSetCodes.size).toBeGreaterThan(0);
    for (const set of storeSetCodes) {
      expect(SET_CODES).toContain(set);
      expect(canonSet(set)).toBe(set);
    }
  });

  it("rebuilds every shipped pairing key unchanged", () => {
    expect(STORE_KEYS.length).toBeGreaterThan(0);
    for (const key of STORE_KEYS) {
      const { name, set, number } = splitKey(key);
      expect(cardKey(name, set, number)).toBe(key);
    }
  });
});

describe("deck naming parity over the listing store", () => {
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
