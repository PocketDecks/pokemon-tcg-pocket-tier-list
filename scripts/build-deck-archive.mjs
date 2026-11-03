import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { deckArchetypeSlug, deckVariantSlug } from "./deck-archetype.mjs";
import { writeFileAtomic } from "./atomic-write.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_FILE = path.join(ROOT, "public", "data", "best-decks.json");
const HISTORICAL_FILE = path.join(ROOT, "public", "data", "historical-trends.json");
const OUT_FILE = path.join(ROOT, "public", "data", "deck-archive.json");

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

const main = () => {
  const archive = process.argv.includes("--seed")
    ? mergeCurrent(seedArchive())
    : mergeCurrent(readJson(OUT_FILE));
  const output = `${JSON.stringify(archive, null, 2)}\n`;
  if (process.argv.includes("--check")) {
    const current = fs.existsSync(OUT_FILE) ? fs.readFileSync(OUT_FILE, "utf8") : "";
    if (current !== output) {
      console.error(`${OUT_FILE} is out of date`);
      process.exit(1);
    }
    return;
  }
  writeFileAtomic(OUT_FILE, output);
  console.log(`Wrote ${archive.length} archived deck variants to ${OUT_FILE}`);
};

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();

export { mergeCurrent, seedArchive };
