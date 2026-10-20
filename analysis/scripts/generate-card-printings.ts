// A set can hold several cards of the same name (Oricorio A3 has four distinct
// attacks). A Limitless slug names the card without its number, so the deck
// store decides which printing the archetype actually plays. Run after a
// download: yarn card-printings:generate
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { canonSet } from "../src/utils/set-codes";

const STORE = resolve(__dirname, "../data/decks");
const OUT = resolve(__dirname, "../src/data/card-printings.json");

interface StoredCard {
  set: string;
  number: string;
  name: string;
}

const counts = new Map<string, Map<string, number>>();

for (const file of readdirSync(STORE).filter((name) => name.endsWith(".ndjson")).sort()) {
  for (const line of readFileSync(resolve(STORE, file), "utf8").split("\n")) {
    if (!line) continue;
    const deck = JSON.parse(line) as { cards: StoredCard[] };
    for (const card of deck.cards) {
      const key = `${canonSet(card.set)} ${card.name}`;
      const byNumber = counts.get(key) ?? new Map<string, number>();
      const number = String(Number(card.number));
      byNumber.set(number, (byNumber.get(number) ?? 0) + 1);
      counts.set(key, byNumber);
    }
  }
}

const printings: Record<string, Record<string, string>> = {};
let ambiguous = 0;

for (const key of [...counts.keys()].sort()) {
  const byNumber = counts.get(key)!;
  if (byNumber.size < 2) continue;
  ambiguous++;
  const [set, ...rest] = key.split(" ");
  const name = rest.join(" ");
  const [number] = [...byNumber].sort(
    (a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0])
  )[0];
  printings[set] = { ...(printings[set] ?? {}), [name]: number };
}

writeFileSync(OUT, `${JSON.stringify(printings, null, 2)}\n`);
console.log(`wrote ${ambiguous} ambiguous printings to ${OUT}`);
