// Regenerates the deck-naming characterisation golden. Run deliberately, never
// in CI: a green regeneration proves nothing, whereas a diff in the golden is
// exactly the signal a naming refactor must be judged on.
//
//   cd analysis && yarn golden:generate
//
// Every primary in the pairing store is named alone, and again paired with each
// of its first three listed partners. That exercises the single-card path, the
// pair path, the same-line bonus, the anchored bonus and the copy/reach ordering
// across the whole shipped store rather than a handful of hand-picked decks.
//
// Pairs are emitted at several copy splits. Naming only ever saw two-ofs before,
// which made one-copy-versus-two-copy invisible: ANCHORED_BONUS never fired and
// no weight change could move a name, so the golden gated nothing.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import pairings from "../src/data/limitless-pairings.json";
import getDeckName from "../src/utils/get-deck-name";
import { Deck } from "../src/utils/types";

const PARTNERS_PER_PRIMARY = 3;
const OUT = resolve(__dirname, "../src/__fixtures__/deck-name-golden.json");

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
    for (const partner of store[key].secondary.slice(0, PARTNERS_PER_PRIMARY)) {
      for (const [first, second] of COPY_SPLITS) {
        golden[`${key} + ${partner} @${first}-${second}`] = getDeckName(
          deckOf([key, partner], [first, second])
        );
      }
    }
  }
  return golden;
};

// Guarded so importing buildGolden from the test cannot overwrite the golden it
// is about to be compared against.
if (require.main === module) {
  const golden = buildGolden();
  writeFileSync(OUT, `${JSON.stringify(golden, null, 2)}\n`);
  console.log(
    `wrote ${Object.keys(golden).length} cases ` +
      `(${new Set(Object.values(golden)).size} distinct names) to ${OUT}`
  );
}
