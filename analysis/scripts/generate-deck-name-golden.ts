// Regenerates the deck-naming characterisation golden. Run deliberately, never
// in CI: a green regeneration proves nothing, whereas a diff in the golden is
// exactly the signal a naming refactor must be judged on.
//
//   cd analysis && yarn golden:generate
//
// Every primary in the pairing store is named alone, and again paired with each
// of its listed partners. That exercises the single-card path, the
// pair path, the same-line bonus, the anchored bonus and the copy/reach ordering
// across the whole shipped store rather than a handful of hand-picked decks.
//
// Pairs are emitted at several copy splits. Naming only ever saw two-ofs before,
// which made one-copy-versus-two-copy invisible: the anchored bonus never fired
// and no weight change could move a name. Copy-count splits alone cannot fix
// that, because both candidates in a case draw from the same two cards and so
// carry identical copy totals. Real tournament deck lists are therefore named
// alongside the synthetic cases; their varied one-ofs and two-ofs and their
// full evolution lines make the anchored bonus reachable.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import cards from "pokemon-tcg-pocket-cards/data/v5/cards.min.json";
import pairings from "../src/data/limitless-pairings.json";
import getDeckName from "../src/utils/get-deck-name";
import { canonSet } from "../src/utils/set-codes";
import { Deck } from "../src/utils/types";

const OUT = resolve(__dirname, "../src/__fixtures__/deck-name-golden.json");
const BEST_DECKS = resolve(__dirname, "../../public/data/best-decks.json");

// Copy splits each pair is named at. A deck of two-ofs cannot express the
// one-copy-versus-two-copy distinction the anchored bonus and the copy
// ordering exist to make, so every pair is named at each split.
const COPY_SPLITS: readonly (readonly [number, number])[] = [
  [2, 2],
  [2, 1],
  [1, 2],
];

interface PairingEntry {
  secondary: string[];
}

const store = (pairings as { pairings: Record<string, PairingEntry> }).pairings;

// A pairing key is "Name SET NUMBER"; the name itself may contain spaces
// ("Team Rocket's Weezing ex B4a 43"), so split from the right.
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
  return golden;
};

// One card as shipped in the database, folded onto the canonical pairing-key
// shape (name, canonSet set code, numeric number with leading zeros dropped).
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

// best-decks.json is a list of archetypes, each with a `lists[]` of deck
// lists whose `cards[]` are "count:set-number" tokens (e.g. "2:b1-184").
interface BestDeckArchetype {
  name: string;
  lists: { cards: string[] }[];
}

// A resolved deck list plus the label it is keyed under in the golden. The
// label carries the archetype name and the list's index so it stays stable
// and cannot collide with the synthetic "Name SET N" keys above.
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
  const bestDecks = JSON.parse(
    readFileSync(BEST_DECKS, "utf8")
  ) as BestDeckArchetype[];
  const decks: { key: string; deck: Deck }[] = [];
  let skipped = 0;
  for (const archetype of bestDecks) {
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
  console.log(
    `wrote ${Object.keys(golden).length} cases ` +
      `(${new Set(Object.values(golden)).size} distinct names) to ${OUT}` +
      (skipped ? `; ${skipped} real deck lists skipped (unresolved card)` : "")
  );
}
