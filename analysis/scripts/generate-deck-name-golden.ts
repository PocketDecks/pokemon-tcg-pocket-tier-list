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
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import pairings from "../src/data/limitless-pairings.json";
import getDeckName from "../src/utils/get-deck-name";
import { Deck } from "../src/utils/types";

const PARTNERS_PER_PRIMARY = 3;
const OUT = resolve(__dirname, "../src/__fixtures__/deck-name-golden.json");

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

const deckOf = (keys: string[]): Deck => ({
  id: "golden",
  name: "golden",
  cards: keys.map((key) => ({ count: 2, ...splitKey(key) })),
  pokemon: keys.length * 2,
  differentPokemon: keys.length,
  winCount: 0,
  lossCount: 0,
  totalGames: 0,
  date: "2024-03-20",
  tournamentExPercent: 0,
  noTrainerPercent: 0,
  wins: [],
  losses: [],
});

export const buildGolden = (): Record<string, string | null> => {
  const golden: Record<string, string | null> = {};
  // Sorted so the file is stable against pairing-store insertion order.
  for (const key of Object.keys(store).sort()) {
    golden[key] = getDeckName(deckOf([key]));
    for (const partner of store[key].secondary.slice(0, PARTNERS_PER_PRIMARY)) {
      golden[`${key} + ${partner}`] = getDeckName(deckOf([key, partner]));
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
