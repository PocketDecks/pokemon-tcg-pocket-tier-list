// Sweeps the Limitless deck pages into src/data/limitless-pairings.json.
// Each run only adds: partners merge onto an existing primary, nothing prunes.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

import cards from "pokemon-tcg-pocket-cards/data/v5/cards.min.json";

import { canonSet } from "../src/utils/set-codes";
import {
  MergeOutcome,
  PairingStore,
  ResolvedDeck,
  SEED_PRIMARIES,
  ensureSeeded,
  mergeDeck,
  pickCurrentSet,
  snapshot,
} from "../src/utils/pairing-store";

const ROOT = resolve(__dirname, "..");
// src/data, not data/: analysis/data is git-ignored as it holds the raw scrape.
const STORE = resolve(ROOT, "src/data/limitless-pairings.json");

interface CardRecord {
  name: string;
  set_code: string;
  id: string;
}

interface IndexedCard {
  name: string;
  set: string;
  number: string;
}

interface ScrapedDeck {
  name: string;
  slug: string;
  set: string;
  count: number;
}

const messageOf = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

// Oldest to newest. Limitless serves the current format for PA, PB and A4b
// regardless of the set asked for, so those mostly repeat the newest set.
const SETS = [
  "A1", "A1a", "A2", "A2a", "A2b", "A3", "A3a", "A3b",
  "A4", "A4a", "B1", "B1a", "B2", "B2a", "B2b", "B3",
  "B3a", "B3b", "B4", "B4a",
];
const NON_STANDARD_SETS = ["PA", "PB", "A4b"];

const decksUrl = (set: string): string =>
  `https://play.limitlesstcg.com/decks?game=pocket&set=${set}`;

// p-a / p-b must precede pa / pb or the promo token never splits.
const SET_TOKEN = "(?:a1a|a1|a2a|a2b|a2|a3a|a3b|a3|a4a|a4b|a4|b1a|b1|b2a|b2b|b2|b3a|b3b|b3|b4a|b4|p-a|p-b|pa|pb)";

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const cardIndex = new Map<string, IndexedCard[]>();
for (const card of cards as CardRecord[]) {
  const number = String(Number(card.id.split("-").pop()));
  const entry: IndexedCard = { name: card.name, set: canonSet(card.set_code), number };
  const key = norm(card.name);
  const bucket = cardIndex.get(key);
  if (bucket) bucket.push(entry);
  else cardIndex.set(key, [entry]);
}

const slugTokens = (slug: string): [string, string][] => {
  const out: [string, string][] = [];
  let rest = slug;
  const re = new RegExp(`^(?<name>.+?)-(?<set>${SET_TOKEN})(?:-|$)`, "i");
  while (rest) {
    const m = rest.match(re);
    if (!m) break;
    out.push([m.groups!.name, m.groups!.set]);
    rest = rest.slice(m[0].length);
  }
  return out;
};

// A4b is a deluxe reprint set, so its cards fold onto the earliest earlier
// printing to stop one card spanning several rows.
const REPRINT_SETS = new Set(["A4b"]);

const canonicalCard = (card: IndexedCard): IndexedCard => {
  if (!REPRINT_SETS.has(card.set)) return card;
  const hits = cardIndex.get(norm(card.name));
  if (!hits?.length) return card;
  const original = hits
    .filter((c) => !REPRINT_SETS.has(c.set))
    .sort((a, b) => a.set.localeCompare(b.set))[0];
  return original ?? card;
};

const resolveCard = (rawName: string, rawSet: string): IndexedCard | null => {
  const wanted = canonSet(rawSet).toLowerCase();
  const spaced = rawName.replace(/-/g, " ");
  const candidates = [
    rawName,
    rawName.replace("rockets", "rocket's"),
    spaced,
    `${spaced} ex`,
    spaced.replace(/ ex$/, ""),
  ];
  for (const candidate of candidates) {
    const hits = cardIndex.get(norm(candidate));
    if (!hits?.length) continue;
    const exact = hits.find((c) => c.set.toLowerCase() === wanted);
    if (exact) return canonicalCard(exact);
    return canonicalCard(hits[0]);
  }
  return null;
};

// Slugs merge two cards into one token when they share a trailing set code
// (hydreigon-mega-absol-ex-b1), so try each hyphen split.
const resolveToken = (rawName: string, rawSet: string): IndexedCard[] => {
  const direct = resolveCard(rawName, rawSet);
  if (direct) return [direct];

  const parts = rawName.split("-");
  for (let i = 1; i < parts.length; i++) {
    const left = resolveCard(parts.slice(0, i).join("-"), rawSet);
    const right = resolveCard(parts.slice(i).join("-"), rawSet);
    if (left && right && left.name !== right.name) return [left, right];
  }
  return [];
};

const ROW =
  /<tr[^>]*>.*?<a href="\/decks\/([a-z0-9-]+)\?[^"]*"[^>]*>([^<]+)<\/a>.*?<\/tr>/gs;
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
  const store = existsSync(STORE)
    ? JSON.parse(readFileSync(STORE, "utf8"))
    : { updatedAt: null, currentSet: null, pairings: {} };
  store.pairings ??= {};

  // Fingerprint of the pairings graph before the scrape, so we only rewrite
  // when something actually moved (mergeDeck reports "merged" even on a no-op).
  const before = snapshot(store);

  const tally: Record<MergeOutcome, number> = { added: 0, merged: 0, unresolved: 0 };
  const unresolved = [];
  const failures = [];

  ensureSeeded(store, SEED_PRIMARIES);

  const fetchedSets = new Set<string>();
  for (const set of [...SETS, ...NON_STANDARD_SETS]) {
    let decks: ScrapedDeck[] = [];
    try {
      decks = await fetchSet(set);
    } catch (err) {
      // One bad page must not discard the whole run's progress.
      failures.push(`${set}: ${messageOf(err)}`);
      process.stdout.write(`${set}! `);
      continue;
    }
    fetchedSets.add(set);
    for (const deck of decks) {
      const resolved: ResolvedDeck = {
        set: deck.set,
        name: deck.name,
        count: deck.count,
        cards: slugTokens(deck.slug).flatMap(([rawName, rawSet]) =>
          resolveToken(rawName, rawSet)
        ),
      };
      const outcome = mergeDeck(store, resolved);
      tally[outcome]++;
      if (outcome === "unresolved" && unresolved.length < 12) {
        unresolved.push(`${set}:${deck.slug}`);
      }
    }
    process.stdout.write(`${set} ${decks.length}  `);
  }

  // Limitless does not list these archetypes, so seed them as primaries with
  // no partners. Skip if the scrape already produced a row for the key.
  const SEEDS = [
    { key: "Oricorio A3 66", set: "A3", number: "66" },
    { key: "Puppy-Loving Girl B3b 67", set: "B3b", number: "67" },
    { key: "Gigalith ex A2 94", set: "A2", number: "94" },
  ];
  for (const s of SEEDS) {
    if (!(s.key in store.pairings)) {
      store.pairings[s.key] = { secondary: [], peakCountBySet: {}, names: {} };
    }
  }

  const changed = snapshot(store) !== before;

  // SETS runs oldest to newest; the non-standard reprint sets that follow it
  // are not the current format, so the newest standard set is the candidate.
  const NEWEST_SET = SETS[SETS.length - 1];
  const nextCurrentSet = pickCurrentSet(store.currentSet, NEWEST_SET, fetchedSets);
  const setChanged = nextCurrentSet !== store.currentSet;
  if (!fetchedSets.has(NEWEST_SET)) {
    console.warn(
      `${NEWEST_SET} page did not come back; currentSet left at ${store.currentSet}`
    );
  }
  store.currentSet = nextCurrentSet;

  if (!changed) {
    if (setChanged) {
      // The graph is unchanged but the current set moved; persist it without
      // bumping updatedAt, which would imply the pairings were refreshed.
      mkdirSync(dirname(STORE), { recursive: true });
      writeFileSync(STORE, `${JSON.stringify(store, null, 2)}\n`);
      console.log(`\npairings unchanged; currentSet set to ${store.currentSet}`);
      if (failures.length) console.log(`set pages skipped: ${failures.join(", ")}`);
      return;
    }
    console.log(
      `\npairings: ${tally.added} new, ${tally.merged} merged, ` +
        `${tally.unresolved} unresolved, ${Object.keys(store.pairings).length} archetypes total (no change)`
    );
    if (unresolved.length) console.log(`unresolved: ${unresolved.join(", ")}`);
    if (failures.length) console.log(`set pages skipped: ${failures.join(", ")}`);
    return;
  }

  store.updatedAt = new Date().toISOString();
  mkdirSync(dirname(STORE), { recursive: true });
  writeFileSync(STORE, `${JSON.stringify(store, null, 2)}\n`);

  console.log(
    `\npairings: ${tally.added} new, ${tally.merged} merged, ` +
      `${tally.unresolved} unresolved, ${Object.keys(store.pairings).length} archetypes total`
  );
  if (unresolved.length) console.log(`unresolved: ${unresolved.join(", ")}`);
  if (failures.length) console.log(`set pages skipped: ${failures.join(", ")}`);
};

main().catch((err) => {
  console.error(`sync-pairings failed: ${messageOf(err)}`);
  process.exit(1);
});
