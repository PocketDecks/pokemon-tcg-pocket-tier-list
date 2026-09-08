// Sweeps the Limitless deck pages into src/data/limitless-pairings.json.
// Each run only adds: partners merge onto an existing primary, nothing prunes.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import cards from "pokemon-tcg-pocket-cards/data/v5/cards.min.json" with { type: "json" };

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// src/data, not data/: analysis/data is git-ignored as it holds the raw scrape.
const STORE = resolve(ROOT, "src/data/limitless-pairings.json");

// Oldest to newest. Limitless serves the current format for PA, PB and A4b
// regardless of the set asked for, so those mostly repeat the newest set.
const SETS = [
  "A1", "A1a", "A2", "A2a", "A2b", "A3", "A3a", "A3b",
  "A4", "A4a", "B1", "B1a", "B2", "B2a", "B2b", "B3",
  "B3a", "B3b", "B4", "B4a",
];
const NON_STANDARD_SETS = ["PA", "PB", "A4b"];

// Archetypes Limitless never lists, so the sweep cannot discover them.
// Seeded here because regeneration rebuilds the file from scratch.
const SEED_PRIMARIES = [
  "Oricorio A3 66",
  "Puppy-Loving Girl B3b 67",
  "Gigalith ex A2 94",
];

const decksUrl = (set) => `https://play.limitlesstcg.com/decks?game=pocket&set=${set}`;

// p-a / p-b must precede pa / pb or the promo token never splits.
const SET_TOKEN = "(?:a1a|a1|a2a|a2b|a2|a3a|a3b|a3|a4a|a4b|a4|b1a|b1|b2a|b2b|b2|b3a|b3b|b3|b4a|b4|p-a|p-b|pa|pb)";

const canonSet = (s) => {
  const v = s.replace("p-b", "pb").replace("p-a", "pa");
  const m = v.match(/^([ab]\d)([ab])$/);
  return m ? `${m[1].toUpperCase()}${m[2]}` : v.toUpperCase();
};

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const cardIndex = new Map();
for (const card of cards) {
  const number = String(Number(card.id.split("-").pop()));
  const entry = { name: card.name, set: canonSet(card.set_code), number };
  const key = norm(card.name);
  const bucket = cardIndex.get(key);
  if (bucket) bucket.push(entry);
  else cardIndex.set(key, [entry]);
}

const cardKey = (c) => `${c.name} ${c.set} ${c.number}`;

const slugTokens = (slug) => {
  const out = [];
  let rest = slug;
  const re = new RegExp(`^(?<name>.+?)-(?<set>${SET_TOKEN})(?:-|$)`, "i");
  while (rest) {
    const m = rest.match(re);
    if (!m) break;
    out.push([m.groups.name, m.groups.set]);
    rest = rest.slice(m[0].length);
  }
  return out;
};

// A4b is a deluxe reprint set, so its cards fold onto the earliest earlier
// printing to stop one card spanning several rows.
const REPRINT_SETS = new Set(["A4b"]);

const canonicalCard = (card) => {
  if (!REPRINT_SETS.has(card.set)) return card;
  const hits = cardIndex.get(norm(card.name));
  if (!hits?.length) return card;
  const original = hits
    .filter((c) => !REPRINT_SETS.has(c.set))
    .sort((a, b) => a.set.localeCompare(b.set))[0];
  return original ?? card;
};

const resolveCard = (rawName, rawSet) => {
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
const resolveToken = (rawName, rawSet) => {
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
  /<tr[^>]*data-share="([\d.]+)"[^>]*>.*?<a href="\/decks\/([a-z0-9-]+)\?[^"]*"[^>]*>([^<]+)<\/a>.*?<\/tr>/gs;
const COUNT_CELL = /<td[^>]*>\s*([\d,]+)\s*<\/td>/;

const fetchSet = async (set) => {
  const res = await fetch(decksUrl(set), { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Limitless ${set} returned ${res.status} ${res.statusText}`);
  const html = await res.text();
  const decks = [];
  const seen = new Set();
  for (const m of html.matchAll(ROW)) {
    const [, share, slug, name] = m;
    if (seen.has(slug)) continue;
    seen.add(slug);
    const countMatch = m[0].match(COUNT_CELL);
    decks.push({
      name: name.trim(),
      slug,
      set,
      count: countMatch ? Number(countMatch[1].replace(/,/g, "")) : 0,
      share: Number(share) * 100,
    });
  }
  return decks;
};

// The primary card identifies the archetype, so partners merge onto it
// instead of starting a second row.
const mergeDeck = (store, deck) => {
  const cards = slugTokens(deck.slug)
    .flatMap(([rawName, rawSet]) => resolveToken(rawName, rawSet))
    .filter(Boolean);
  if (!cards.length) return "unresolved";

  const [primary, ...partners] = cards.map(cardKey);
  const seen = primary in store.pairings;

  if (!seen) {
    store.pairings[primary] = {
      secondary: [],
      peakCountBySet: {},
      names: {},
    };
  }

  const entry = store.pairings[primary];

  for (const partner of partners) {
    if (!entry.secondary.includes(partner)) entry.secondary.push(partner);
  }

  const previousBest = entry.peakCountBySet[deck.set] ?? 0;
  if (deck.count > previousBest) entry.peakCountBySet[deck.set] = deck.count;
  entry.names[deck.name] = Math.max(entry.names[deck.name] ?? 0, deck.count);

  return seen ? "merged" : "added";
};

const main = async () => {
  const store = existsSync(STORE)
    ? JSON.parse(readFileSync(STORE, "utf8"))
    : { updatedAt: null, currentSet: null, pairings: {} };
  store.pairings ??= {};

  // Signature of the pairings graph before the scrape, so we only rewrite
  // when something actually moved (mergeDeck reports "merged" even on a no-op).
  const sig = (p) =>
    Object.keys(p)
      .sort()
      .map((k) => `${k}:${[...(p[k].secondary || [])].sort().join(",")}:${Object.entries(p[k].peakCountBySet || {}).sort().map(([s, n]) => `${s}=${n}`).join(",")}`)
      .join("|");

  const before = sig(store.pairings);

  const tally = { added: 0, merged: 0, unresolved: 0 };
  const unresolved = [];
  const failures = [];

  for (const primary of SEED_PRIMARIES) {
    store.pairings[primary] ??= {
      secondary: [],
      peakCountBySet: {},
      names: {},
    };
  }

  let lastFetched = null;
  for (const set of [...SETS, ...NON_STANDARD_SETS]) {
    let decks = [];
    try {
      decks = await fetchSet(set);
    } catch (err) {
      // One bad page must not discard the whole run's progress.
      failures.push(`${set}: ${err.message}`);
      process.stdout.write(`${set}! `);
      continue;
    }
    lastFetched = set;
    for (const deck of decks) {
      const outcome = mergeDeck(store, deck);
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

  const changed = sig(store.pairings) !== before;

  if (lastFetched && lastFetched !== store.currentSet) {
    store.currentSet = lastFetched;
  } else if (!lastFetched) {
    // No set fetched; keep currentSet so peakSum and isCurrentSetCard use a real set.
    console.warn("no set fetched successfully; currentSet unchanged");
  }

  if (!changed) {
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
  console.error(`sync-pairings failed: ${err.message}`);
  process.exit(1);
});
