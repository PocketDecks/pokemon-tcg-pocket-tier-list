import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { deckArchetypeSlug, deckVariantSlug, hubDisplayName } from "./deck-archetype.mjs";
import { writeFileAtomic } from "./atomic-write.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_FILE = path.join(ROOT, "public", "data", "best-decks.json");
const HISTORICAL_FILE = path.join(ROOT, "public", "data", "historical-trends.json");
const OUT_FILE = path.join(ROOT, "public", "data", "deck-archive.json");
const HUBS_DIR = path.join(ROOT, "public", "data", "hubs");

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

const currentSnapshotDate = () => {
  const trends = readJson(HISTORICAL_FILE);
  return trends.map((row) => row.date).sort().at(-1) ?? new Date().toISOString().slice(0, 10);
};

const snapshotDate = (commit) => {
  const output = execFileSync("git", ["show", "-s", "--format=%cs", commit], {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();
  return output;
};

const snapshotCommits = () =>
  execFileSync("git", ["log", "--format=%H", "--", "public/data/best-decks.json"], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);

const namesAtCommit = (commit) => {
  const raw = execFileSync("git", ["show", `${commit}:public/data/best-decks.json`], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  return readJsonFromText(raw).map((deck) => deck.name);
};

const readJsonFromText = (text) => JSON.parse(text);
const oldSlug = (name) => name.toLowerCase().replace(/\s/g, "-");

const snapshotNames = (commit) => {
  const names = namesAtCommit(commit);
  return names.map((name) => ({ name, variant: deckVariantSlug(name), legacy: oldSlug(name) }));
};

const seedArchive = () => {
  const archive = new Map();
  for (const commit of snapshotCommits().reverse()) {
    const date = snapshotDate(commit);
    for (const { name, variant, legacy } of snapshotNames(commit)) {
      const hub = deckArchetypeSlug(name);
      const existing = archive.get(variant);
      const legacySlugs = new Set(existing?.legacySlugs ?? []);
      if (legacy !== variant) legacySlugs.add(legacy);
      archive.set(variant, {
        variant,
        hub,
        name,
        firstSeen: existing?.firstSeen ?? date,
        lastSeen: date,
        ...(legacySlugs.size > 0 ? { legacySlugs: [...legacySlugs].sort() } : {}),
      });
    }
  }
  return [...archive.values()].sort((a, b) => a.variant.localeCompare(b.variant));
};

const mergeCurrent = (archive) => {
  const byVariant = new Map(archive.map((entry) => [entry.variant, entry]));
  const date = currentSnapshotDate();
  for (const deck of readJson(DATA_FILE)) {
    const variant = deckVariantSlug(deck.name);
    const previous = byVariant.get(variant);
    byVariant.set(variant, {
      variant,
      hub: deckArchetypeSlug(deck.name),
      name: deck.name,
      firstSeen: previous?.firstSeen ?? date,
      lastSeen: date,
      ...(previous?.legacySlugs ? { legacySlugs: previous.legacySlugs } : {}),
    });
  }
  const clamped = [...byVariant.values()].map((entry) =>
    entry.firstSeen > entry.lastSeen ? { ...entry, firstSeen: entry.lastSeen } : entry
  );
  return clamped.sort((a, b) => a.variant.localeCompare(b.variant));
};

const CARD_ID = /^\d+:[a-z0-9-]+$/;

const legacyCardId = (card) => {
  if (!card || typeof card !== "object") return null;
  const { count, set, number } = card;
  if (!Number.isInteger(count) || count < 1 || typeof set !== "string" || typeof number !== "string") return null;
  if (!/^\d+$/.test(number)) return null;
  const code = set.toLowerCase().replace(/[^a-z0-9]/g, "");
  return code ? `${count}:${code}-${number.padStart(3, "0")}` : null;
};

export const listCardIds = (deck) => {
  const first = Array.isArray(deck.lists) ? deck.lists[0] : undefined;
  if (first && Array.isArray(first.cards)) {
    return first.cards.every((card) => typeof card === "string" && CARD_ID.test(card)) ? [...first.cards] : [];
  }
  if (Array.isArray(deck.cards)) {
    const ids = deck.cards.map(legacyCardId);
    return ids.every((id) => id !== null) ? ids : [];
  }
  return [];
};

export const deckShare = (deck) =>
  typeof deck.percentOfGames === "number"
    ? deck.percentOfGames
    : typeof deck.popularity === "number"
      ? deck.popularity
      : null;

export const variantStateFromSnapshots = (snapshots) => {
  const state = new Map();
  for (const { date, decks } of snapshots) {
    for (const deck of decks) {
      const variant = deckVariantSlug(deck.name);
      const share = deckShare(deck);
      const current = state.get(variant);
      if (current === undefined) {
        state.set(variant, { cards: listCardIds(deck), peakShare: share, peakDate: share === null ? null : date });
      } else if (share !== null && (current.peakShare === null || share > current.peakShare)) {
        current.peakShare = share;
        current.peakDate = date;
      }
    }
  }
  return state;
};

export const applyLive = (state, decks, date) => {
  for (const deck of decks) {
    const variant = deckVariantSlug(deck.name);
    const share = deckShare(deck);
    const current = state.get(variant) ?? { cards: [], peakShare: null, peakDate: null };
    current.cards = listCardIds(deck);
    if (share !== null && (current.peakShare === null || share > current.peakShare)) {
      current.peakShare = share;
      current.peakDate = date;
    }
    state.set(variant, current);
  }
  return state;
};

export const variantStateFromHubs = (hubs) => {
  const state = new Map();
  for (const hub of hubs) {
    for (const variant of hub.variants) {
      state.set(variant.variant, { cards: variant.cards, peakShare: variant.peakShare, peakDate: variant.peakDate });
    }
  }
  return state;
};

export const hubFilesFromState = (archive, state) => {
  const grouped = new Map();
  for (const entry of archive) grouped.set(entry.hub, [...(grouped.get(entry.hub) ?? []), entry]);
  return new Map(
    [...grouped].map(([hub, entries]) => [
      hub,
      {
        hub,
        name: hubDisplayName(entries),
        variants: entries.map((entry) => {
          const record = state.get(entry.variant) ?? { cards: [], peakShare: null, peakDate: null };
          return {
            variant: entry.variant,
            name: entry.name,
            firstSeen: entry.firstSeen,
            lastSeen: entry.lastSeen,
            peakShare: record.peakShare,
            peakDate: record.peakDate,
            cards: record.cards,
          };
        }),
      },
    ])
  );
};

export const hubFileText = (content) => `${JSON.stringify(content, null, 2)}\n`;

const orphanHubFiles = (hubs, dir) =>
  (fs.existsSync(dir) ? fs.readdirSync(dir) : []).filter(
    (name) => name.endsWith(".json") && !hubs.has(name.slice(0, -".json".length))
  );

export const hubFileIssues = (hubs, dir = HUBS_DIR) => {
  const issues = [];
  for (const [hub, content] of hubs) {
    const file = path.join(dir, `${hub}.json`);
    if (!fs.existsSync(file)) issues.push(`${hub}.json is missing`);
    else if (fs.readFileSync(file, "utf8") !== hubFileText(content)) issues.push(`${hub}.json is stale`);
  }
  for (const name of orphanHubFiles(hubs, dir)) issues.push(`${name} is an orphan`);
  return issues;
};

const readHubFiles = () =>
  fs.existsSync(HUBS_DIR)
    ? fs
        .readdirSync(HUBS_DIR)
        .filter((name) => name.endsWith(".json"))
        .map((name) => readJson(path.join(HUBS_DIR, name)))
    : [];

function* snapshotsNewestFirst() {
  for (const commit of snapshotCommits()) {
    yield {
      date: snapshotDate(commit),
      decks: readJsonFromText(
        execFileSync("git", ["show", `${commit}:public/data/best-decks.json`], {
          cwd: ROOT,
          encoding: "utf8",
          maxBuffer: 256 * 1024 * 1024,
        })
      ),
    };
  }
}

const main = () => {
  const seeding = process.argv.includes("--seed");
  const archive = seeding ? mergeCurrent(seedArchive()) : mergeCurrent(readJson(OUT_FILE));
  const history = seeding ? variantStateFromSnapshots(snapshotsNewestFirst()) : variantStateFromHubs(readHubFiles());
  const state = applyLive(history, readJson(DATA_FILE), currentSnapshotDate());
  const hubs = hubFilesFromState(archive, state);
  const output = `${JSON.stringify(archive, null, 2)}\n`;
  if (process.argv.includes("--check")) {
    const current = fs.existsSync(OUT_FILE) ? fs.readFileSync(OUT_FILE, "utf8") : "";
    const issues = [
      ...(current !== output ? [`${OUT_FILE} is out of date`] : []),
      ...hubFileIssues(hubs),
    ];
    if (issues.length > 0) {
      console.error(issues.join("\n"));
      process.exit(1);
    }
    return;
  }
  writeFileAtomic(OUT_FILE, output);
  fs.mkdirSync(HUBS_DIR, { recursive: true });
  for (const [hub, content] of hubs) writeFileAtomic(path.join(HUBS_DIR, `${hub}.json`), hubFileText(content));
  for (const name of orphanHubFiles(hubs, HUBS_DIR)) fs.rmSync(path.join(HUBS_DIR, name));
  console.log(`Wrote ${archive.length} archived deck variants and ${hubs.size} hub files to ${HUBS_DIR}`);
};

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();

export { mergeCurrent, seedArchive };
