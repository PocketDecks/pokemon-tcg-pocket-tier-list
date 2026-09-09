// Regenerates the deck-naming characterisation golden. Run deliberately, never
// in CI: a green regeneration proves nothing, whereas a diff in the golden is
// exactly the signal a naming refactor must be judged on.
//
//   cd analysis && yarn golden:generate
//
// Every listing row is named as a deck of its own resolved cards, at a 2-2 copy
// split where it pairs with another row, then real deck lists and seeded
// archetypes are named the same way. Naming now reads the per-set listings
// store directly, so a row names a deck only when the deck holds every card the
// row lists.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import cards from "pokemon-tcg-pocket-cards/data/v5/cards.min.json";
import listings from "../src/data/limitless-decks.json";
import realDeckLists from "../src/__fixtures__/real-deck-lists.json";
import getDeckName from "../src/utils/get-deck-name";
import { canonSet, cardKey } from "../src/utils/set-codes";
import { resolveSlug } from "../src/utils/slug-cards";
import { Deck } from "../src/utils/types";

const OUT = resolve(__dirname, "../src/__fixtures__/deck-name-golden.json");
const REAL_DECK_LISTS = resolve(__dirname, "../src/__fixtures__/real-deck-lists.json");

const COPY_SPLITS: readonly (readonly [number, number])[] = [
  [2, 2],
  [2, 1],
  [1, 2],
];

interface DeckListing {
  name: string;
  slug: string;
  count: number;
}
interface SetListing {
  decks: DeckListing[];
}
const store = (listings as { sets: Record<string, SetListing> }).sets;

const deckOf = (keys: string[], counts?: readonly number[]): Deck => {
  const copies = keys.map((_, index) => counts?.[index] ?? 2);
  return {
    id: "golden",
    name: "golden",
    cards: keys.map((key, index) => {
      const parts = key.split(" ");
      const number = parts.pop() ?? "";
      const set = parts.pop() ?? "";
      return { count: copies[index], name: parts.join(" "), set, number };
    }),
    pokemon: copies.reduce((acc, count) => acc + count, 0),
    differentPokemon: new Set(keys).size,
    winCount: 0,
    lossCount: 0,
    totalGames: 0,
    date: "2024-03-20",
    tournamentExPercent: 0,
    noTrainerPercent: 0,
    wins: [],
    losses: [],
  };
};

// Every listing row named as a deck of its own resolved cards.
const buildListingCases = (): { decks: { key: string; deck: Deck }[] } => {
  const decks: { key: string; deck: Deck }[] = [];
  for (const [set, listing] of Object.entries(store)) {
    for (const row of listing.decks) {
      const keys = resolveSlug(row.slug).map((c) =>
        cardKey(c.name, c.set, c.number)
      );
      if (!keys.length) continue;
      decks.push({ key: `listing:${set}:${row.slug}`, deck: deckOf(keys) });
    }
  }
  decks.sort((a, b) => a.key.localeCompare(b.key));
  return { decks };
};

// Seeded archetypes never appear as listings, so name the seed with one
// reference partner card the way a real list would pair it.
const buildSeededCases = (): { decks: { key: string; deck: Deck }[] } => {
  const reference = Object.values(store)
    .flatMap((listing) => listing.decks)
    .map((row) => resolveSlug(row.slug).map((c) => cardKey(c.name, c.set, c.number)))
    .find((keys) => keys.length >= 2);
  const decks: { key: string; deck: Deck }[] = [];
  const seeds: [string, string[]][] = [
    ["Oricorio A3 66", ["Oricorio A3 66"]],
    ["Puppy-Loving Girl B3b 67", ["Puppy-Loving Girl B3b 67"]],
    ["Gigalith ex A2 94", ["Gigalith ex A2 94"]],
  ];
  for (const [primary, display] of seeds) {
    decks.push({ key: `seed:${primary}`, deck: deckOf(display) });
    if (reference) {
      for (const [first, second] of COPY_SPLITS) {
        decks.push({
          key: `seed:${primary} + ${reference[1]} @${first}-${second}`,
          deck: deckOf([...display, reference[1]], [first, second]),
        });
      }
    }
  }
  decks.sort((a, b) => a.key.localeCompare(b.key));
  return { decks };
};

export const buildGolden = (): Record<string, string | null> => {
  const golden: Record<string, string | null> = {};
  for (const { key, deck } of buildListingCases().decks) {
    golden[key] = getDeckName(deck);
  }
  for (const { key, deck } of buildRealDecks().decks) {
    golden[key] = getDeckName(deck);
  }
  for (const { key, deck } of buildSeededCases().decks) {
    golden[key] = getDeckName(deck);
  }
  return golden;
};

interface RealCard {
  name: string;
  set: string;
  number: string;
}

const cardById = new Map<string, RealCard>();
for (const card of cards as { id: string; name: string; set_code: string }[]) {
  cardById.set(card.id, {
    name: card.name,
    set: canonSet(card.set_code),
    number: String(Number(card.id.split("-").pop())),
  });
}

interface BestDeckArchetype {
  name: string;
  lists: { cards: string[] }[];
}

const resolveList = (
  archetype: string,
  index: number,
  list: { cards: string[] }
): { key: string; deck: Deck } | null => {
  const resolved: { count: number; name: string; set: string; number: string }[] = [];
  for (const token of list.cards) {
    const [count, id] = token.split(":", 2);
    const card = cardById.get(id);
    if (!card) return null;
    resolved.push({ count: Number(count), ...card });
  }
  const distinct = new Set(
    resolved.map((card) => `${card.name} ${card.set} ${card.number}`)
  ).size;
  return {
    key: `real:${archetype}#${index}`,
    deck: {
      id: "golden",
      name: archetype,
      cards: resolved,
      pokemon: resolved.reduce((acc, card) => acc + card.count, 0),
      differentPokemon: distinct,
      winCount: 0,
      lossCount: 0,
      totalGames: 0,
      date: "2024-03-20",
      tournamentExPercent: 0,
      noTrainerPercent: 0,
      wins: [],
      losses: [],
    },
  };
};

const buildRealDecks = (): {
  decks: { key: string; deck: Deck }[];
  skipped: number;
} => {
  const decks: { key: string; deck: Deck }[] = [];
  let skipped = 0;
  for (const archetype of realDeckLists as BestDeckArchetype[]) {
    archetype.lists.forEach((list, index) => {
      const built = resolveList(archetype.name, index, list);
      if (built) decks.push(built);
      else skipped++;
    });
  }
  decks.sort((a, b) => a.key.localeCompare(b.key));
  return { decks, skipped };
};

// Guarded so importing buildGolden from the test cannot overwrite the golden it
// is about to be compared against.
if (require.main === module) {
  const golden = buildGolden();
  writeFileSync(OUT, `${JSON.stringify(golden, null, 2)}\n`);
  const { skipped } = buildRealDecks();
  if (skipped) {
    throw new Error(
      `${skipped} real deck lists failed to resolve to cards. The golden would ` +
        `silently shrink. Regenerate real-deck-lists.json or fix the card ids.`
    );
  }
  console.log(
    `wrote ${Object.keys(golden).length} cases ` +
      `(${new Set(Object.values(golden)).size} distinct names) to ${OUT}`
  );
}
