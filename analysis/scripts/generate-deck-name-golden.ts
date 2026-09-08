// Regenerates the deck-naming characterisation golden. Run deliberately, never
// in CI: a green regeneration proves nothing, whereas a diff in the golden is
// exactly the signal a naming refactor must be judged on.
//
//   cd analysis && yarn golden:generate
//
// Every primary is named alone and paired with each listed partner at every
// copy split. Pairs alone cannot reach the anchored bonus, because both
// candidates draw from the same two cards; real tournament lists supply the
// varied one-ofs and full evolution lines that do.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import cards from "pokemon-tcg-pocket-cards/data/v5/cards.min.json";
import pairings from "../src/data/limitless-pairings.json";
import realDeckLists from "../src/__fixtures__/real-deck-lists.json";
import getDeckName from "../src/utils/get-deck-name";
import { canonSet } from "../src/utils/set-codes";
import { Deck } from "../src/utils/types";

const SEED_PARTNERS = 5;
const OUT = resolve(__dirname, "../src/__fixtures__/deck-name-golden.json");
const REAL_DECK_LISTS = resolve(__dirname, "../src/__fixtures__/real-deck-lists.json");

const COPY_SPLITS: readonly (readonly [number, number])[] = [
  [2, 2],
  [2, 1],
  [1, 2],
];

interface PairingEntry {
  secondary: string[];
  peakCountBySet?: Record<string, number>;
}

const store = (pairings as { pairings: Record<string, PairingEntry> }).pairings;

// A pairing key is "Name SET NUMBER"; the name itself may contain spaces, so
// split from the right.
const splitKey = (key: string): { name: string; set: string; number: string } => {
  const parts = key.split(" ");
  const number = parts.pop() ?? "";
  const set = parts.pop() ?? "";
  return { name: parts.join(" "), set, number };
};

const deckOf = (keys: string[], counts?: readonly number[]): Deck => {
  const copies = keys.map((_, index) => counts?.[index] ?? 2);
  return {
    id: "golden",
    name: "golden",
    cards: keys.map((key, index) => ({ count: copies[index], ...splitKey(key) })),
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

const buildSeededCases = (): { decks: { key: string; deck: Deck }[] } => {
  const byReach = Object.keys(store)
    .map((key) => {
      const peaks = store[key].peakCountBySet;
      return { key, peaks };
    })
    .filter(({ peaks }) => !!peaks && Object.keys(peaks).length > 0)
    .map(({ key, peaks }) => [key, Math.max(...Object.values(peaks!))] as [
      string,
      number
    ])
    .sort((a, b) => b[1] - a[1]);

  const seededKeys = Object.keys(store).filter(
    (key) => Object.keys(store[key].peakCountBySet ?? {}).length === 0
  );

  const decks: { key: string; deck: Deck }[] = [];
  for (const seed of seededKeys) {
    for (const [partner] of byReach.slice(0, SEED_PARTNERS)) {
      for (const [first, second] of COPY_SPLITS) {
        decks.push({
          key: `seed:${seed} + ${partner} @${first}-${second}`,
          deck: deckOf([seed, partner], [first, second]),
        });
      }
    }
  }
  decks.sort((a, b) => a.key.localeCompare(b.key));
  return { decks };
};

export const buildGolden = (): Record<string, string | null> => {
  const golden: Record<string, string | null> = {};
  // Sorted so the file is stable against pairing-store insertion order.
  for (const key of Object.keys(store).sort()) {
    golden[key] = getDeckName(deckOf([key]));
    for (const partner of store[key].secondary) {
      for (const [first, second] of COPY_SPLITS) {
        golden[`${key} + ${partner} @${first}-${second}`] = getDeckName(
          deckOf([key, partner], [first, second])
        );
      }
    }
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
