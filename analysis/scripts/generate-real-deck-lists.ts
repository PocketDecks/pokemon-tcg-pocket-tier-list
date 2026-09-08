// Snapshots the real tournament deck lists the naming golden replays, so the
// golden stops depending on public/data/best-decks.json. That file is written
// by the analysis pipeline for the frontend; depending on it means a routine
// pipeline run can move analysis test results.
//
//   cd analysis && yarn real-decks:generate
//
// Run deliberately when best-decks.json legitimately gains archetypes.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SOURCE = resolve(__dirname, "../../public/data/best-decks.json");
const OUT = resolve(__dirname, "../src/__fixtures__/real-deck-lists.json");

interface BestDeckArchetype {
  name: string;
  lists: { cards: string[] }[];
}

const bestDecks = JSON.parse(readFileSync(SOURCE, "utf8")) as BestDeckArchetype[];

// Sorted so the snapshot is stable against source ordering.
const snapshot = bestDecks
  .map((archetype) => ({
    name: archetype.name,
    lists: archetype.lists.map((list) => ({ cards: [...list.cards].sort() })),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

writeFileSync(OUT, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(
  `wrote ${snapshot.length} archetypes, ` +
    `${snapshot.reduce((acc, a) => acc + a.lists.length, 0)} lists, to ${OUT}`
);
