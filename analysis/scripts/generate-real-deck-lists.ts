// Snapshots the real tournament deck lists the naming golden replays, so the
// golden stops depending on public/data/best-decks.json, which the pipeline
// rewrites for the frontend.
//
//   cd analysis && yarn real-decks:generate
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SOURCE = resolve(__dirname, "../../public/data/best-decks.json");
const OUT = resolve(__dirname, "../src/__fixtures__/real-deck-lists.json");

interface BestDeckArchetype {
  name: string;
  lists: { cards: string[] }[];
}

const bestDecks = JSON.parse(readFileSync(SOURCE, "utf8")) as BestDeckArchetype[];

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const snapshot = bestDecks
  .map((archetype) => ({
    name: archetype.name,
    lists: archetype.lists
      .map((list) => ({ cards: [...list.cards].sort(byCodeUnit) }))
      .sort((a, b) => byCodeUnit(a.cards.join(","), b.cards.join(","))),
  }))
  .sort((a, b) => byCodeUnit(a.name, b.name));

writeFileSync(OUT, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(
  `wrote ${snapshot.length} archetypes, ` +
    `${snapshot.reduce((acc, a) => acc + a.lists.length, 0)} lists, to ${OUT}`
);
