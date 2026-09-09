// Sweeps the Limitless deck pages into src/data/limitless-decks.json. Each set
// page is one snapshot of its own decks array; a refetch replaces that array
// and never folds across sets or infers a pairing graph.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  mergeSetPage,
  pickCurrentSet,
  readStore,
  SETS_SCRAPE_ORDER,
  snapshot,
  DeckListingStore,
} from "../src/utils/deck-listing-store";
import { hasUnknownSetCodes, slugTokens, unknownSetCodeList } from "../src/utils/slug-cards";
import { STANDARD_SET_CODES } from "../src/utils/set-codes";

const ROOT = resolve(__dirname, "..");
// src/data, not data/: analysis/data is git-ignored as it holds the raw scrape.
const STORE = resolve(ROOT, "src/data/limitless-decks.json");

interface ScrapedDeck {
  name: string;
  slug: string;
  set: string;
  count: number;
}

const messageOf = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

const decksUrl = (set: string): string =>
  `https://play.limitlesstcg.com/decks?game=pocket&set=${set}`;

const ROW =
  /<tr[^>]*>.*?<a href="\/decks\/([a-z0-9-]+)\?[^\"]*"[^>]*>([^<]+)<\/a>.*?<\/tr>/gs;
const COUNT_CELL = /<td[^>]*>\s*([\d,]+)\s*<\/td>/;

const fetchSet = async (set: string): Promise<ScrapedDeck[]> => {
  const res = await fetch(decksUrl(set), { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Limitless ${set} returned ${res.status} ${res.statusText}`);
  const html = await res.text();
  const decks: ScrapedDeck[] = [];
  const seen = new Set();
  for (const m of html.matchAll(ROW)) {
    const [, slug, name] = m;
    if (seen.has(slug)) continue;
    seen.add(slug);
    const countMatch = m[0].match(COUNT_CELL);
    decks.push({
      name: name.trim(),
      slug,
      set,
      count: countMatch ? Number(countMatch[1].replace(/,/g, "")) : 0,
    });
  }
  return decks;
};

const main = async () => {
  const store: DeckListingStore = existsSync(STORE)
    ? readStore(readFileSync(STORE, "utf8"))
    : readStore(null);

  // Snapshot of the set pages before the scrape, so updatedAt moves only when
  // content actually changed.
  const before = snapshot(store);

  const unresolved: string[] = [];
  const failures: string[] = [];

  if (hasUnknownSetCodes()) {
    failures.push(
      `card database: unrecognised set code(s) ${unknownSetCodeList().join(", ")}`
    );
  }

  const fetchedSets = new Set<string>();
  for (const set of SETS_SCRAPE_ORDER) {
    let decks: ScrapedDeck[];
    try {
      decks = await fetchSet(set);
    } catch (err) {
      // One bad page must not discard the run; the previous snapshot for this
      // set stays in memory and is written back unchanged.
      failures.push(`${set}: ${messageOf(err)}`);
      process.stdout.write(`${set}! `);
      continue;
    }
    fetchedSets.add(set);
    for (const deck of decks) {
      // A slug with no known set code cannot be filed under a set; that signals
      // a new set reached Limitless and SET_CODES needs updating.
      if (slugTokens(deck.slug).length === 0 && unresolved.length < 12) {
        unresolved.push(`${set}:${deck.slug}`);
      }
    }
    mergeSetPage(
      store,
      set,
      decks.map((d) => ({ name: d.name, slug: d.slug, count: d.count }))
    );
    process.stdout.write(`${set} ${decks.length}  `);
  }

  const changed = snapshot(store) !== before;

  // STANDARD_SET_CODES runs oldest to newest; the newest is the current format.
  const NEWEST_SET = STANDARD_SET_CODES[STANDARD_SET_CODES.length - 1];
  const nextCurrentSet = pickCurrentSet(store.currentSet, NEWEST_SET, fetchedSets);
  const setChanged = nextCurrentSet !== store.currentSet;
  if (!fetchedSets.has(NEWEST_SET)) {
    console.warn(
      `${NEWEST_SET} page did not come back; currentSet left at ${store.currentSet}`
    );
  }
  store.currentSet = nextCurrentSet;

  // updatedAt means "the listings were refreshed", so it moves only when they
  // actually did. A currentSet change on its own is still worth persisting.
  if (changed) store.updatedAt = new Date().toISOString();
  if (changed || setChanged) {
    mkdirSync(dirname(STORE), { recursive: true });
    writeFileSync(STORE, `${JSON.stringify(store, null, 2)}\n`);
  }

  const total = Object.values(store.sets).reduce(
    (acc, s) => acc + s.decks.length,
    0
  );
  console.log(
    `\nlistings: ${total} rows across ${Object.keys(store.sets).length} sets` +
      `${changed ? "" : " (no change)"}` +
      `${setChanged ? `; currentSet set to ${store.currentSet}` : ""}`
  );
  if (unresolved.length) console.log(`unresolved slugs: ${unresolved.join(", ")}`);
  if (failures.length) console.log(`set pages skipped: ${failures.join(", ")}`);

  // A run that fetched nothing is a hard failure: the store is unchanged, so
  // the workflow guard would treat it as a clean scrape. Unknown set codes
  // mean the card database is stale and must not pass.
  if (fetchedSets.size === 0 || hasUnknownSetCodes()) {
    process.exitCode = 1;
  }
};

main().catch((err) => {
  console.error(`sync-pairings failed: ${messageOf(err)}`);
  process.exit(1);
});
