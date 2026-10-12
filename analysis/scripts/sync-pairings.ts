// Sweeps the Limitless deck pages into src/data/limitless-decks.json. Each set
// page is one snapshot of its own decks array; a refetch replaces that array
// and never folds across sets or infers a pairing graph.
import "../src/load-env-side-effect";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  mergeSetPage,
  pageFingerprint,
  pickCurrentSet,
  readStore,
  SETS_SCRAPE_ORDER,
  snapshot,
  DeckListingStore,
} from "../src/utils/deck-listing-store";
import { hasUnknownSetCodes, resolveSlug, unknownSetCodeList } from "../src/utils/slug-cards";
import { fetchSetPage, ParsedSetPage } from "../src/utils/parse-set-page";
import { STANDARD_SET_CODES } from "../src/utils/set-codes";

const ROOT = resolve(__dirname, "..");
// src/data, not data/: analysis/data is git-ignored as it holds the raw scrape.
const STORE = resolve(ROOT, "src/data/limitless-decks.json");

const messageOf = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

export interface SyncRunState {
  fetchedSets: number;
  unknownSetCodes: boolean;
  unresolvedSlugs: number;
  failures: number;
}

// The exit code is the only signal the refresh job reads: it stops on a
// non-zero exit, so a run that recorded a failure has to fail. A run that
// fetched nothing fails as well, because the store is unchanged and the job
// would treat it as a clean scrape. Unknown set codes mean the card database is
// stale and must not pass.
export const exitCodeFor = (state: SyncRunState): number =>
  state.fetchedSets === 0 ||
  state.unknownSetCodes ||
  state.unresolvedSlugs > 0 ||
  state.failures > 0
    ? 1
    : 0;

const main = async () => {
  const store: DeckListingStore = existsSync(STORE)
    ? readStore(readFileSync(STORE, "utf8"))
    : readStore(null);

  // Snapshot of the set pages before the scrape, so updatedAt moves only when
  // content actually changed.
  const before = snapshot(store);

  const unresolved: string[] = [];
  const failures: string[] = [];
  let unresolvedTotal = 0;

  if (hasUnknownSetCodes()) {
    failures.push(
      `card database: unrecognised set code(s) ${unknownSetCodeList().join(", ")}`
    );
  }

  const fetchedSets = new Set<string>();
  const seenPages = new Map<string, string>();
  for (const set of SETS_SCRAPE_ORDER) {
    let page: ParsedSetPage;
    try {
      page = await fetchSetPage(set);
    } catch (err) {
      // One bad page must not discard the run; the previous snapshot for this
      // set stays in memory and is written back unchanged.
      failures.push(`${set}: ${messageOf(err)}`);
      process.stdout.write(`${set}! `);
      continue;
    }
    const decks = page.decks;
    // Two sets never share a page. The same rows twice in one run means one
    // body was served for both, which once filed a single scrape under four
    // set keys and let decks from one format name decks in another.
    const fingerprint = pageFingerprint(decks);
    const twin = seenPages.get(fingerprint);
    if (twin) {
      failures.push(`${set}: identical to ${twin}, not written`);
      process.stdout.write(`${set}=${twin} `);
      continue;
    }
    seenPages.set(fingerprint, set);
    fetchedSets.add(set);
    for (const deck of decks) {
      // A slug with no known set code cannot be filed under a set; that signals
      // a new set reached Limitless and SET_CODES needs updating.
      if (resolveSlug(deck.slug).length === 0) {
        unresolvedTotal += 1;
        if (unresolved.length < 12) unresolved.push(`${set}:${deck.slug}`);
      }
    }
    mergeSetPage(store, set, decks);
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

  process.exitCode = exitCodeFor({
    fetchedSets: fetchedSets.size,
    unknownSetCodes: hasUnknownSetCodes(),
    unresolvedSlugs: unresolvedTotal,
    failures: failures.length,
  });
};

if (process.argv[1]?.endsWith("sync-pairings.ts")) {
  main().catch((err) => {
    console.error(`sync-pairings failed: ${messageOf(err)}`);
    process.exit(1);
  });
}
