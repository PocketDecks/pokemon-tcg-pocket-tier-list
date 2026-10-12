import fs from "fs";
import path from "path";
import { Deck } from "./types";
import { shardIdForDate } from "./expansion-shards";

export type StoredDeck = Omit<Deck, "name">;

export interface ShardEntry {
  file: string;
  count: number;
  minDate: string;
  maxDate: string;
}

export interface Manifest {
  schema: 1;
  shards: Record<string, ShardEntry>;
}

export const MANIFEST_FILE = "manifest.json";

export const emptyManifest = (): Manifest => ({ schema: 1, shards: {} });

export const readManifest = (dir: string): Manifest => {
  const file = path.join(dir, MANIFEST_FILE);
  if (!fs.existsSync(file)) return emptyManifest();
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Manifest;
  if (parsed.schema !== 1 || typeof parsed.shards !== "object" || parsed.shards === null) {
    throw new Error(`Unsupported deck store manifest at ${file}`);
  }
  return parsed;
};

const parseLines = (text: string): Deck[] =>
  text
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Deck);

export const readShard = (dir: string, entry: ShardEntry): Deck[] =>
  parseLines(fs.readFileSync(path.join(dir, entry.file), "utf8"));

export const readDecks = (dir: string, since?: Date): Deck[] => {
  const manifest = readManifest(dir);
  const sinceTime = since ? since.getTime() : Number.NEGATIVE_INFINITY;
  const decks = Object.keys(manifest.shards)
    .sort()
    .filter((id) => new Date(manifest.shards[id].maxDate).getTime() >= sinceTime)
    .flatMap((id) => readShard(dir, manifest.shards[id]));
  // A deck read twice is counted twice in every share it reaches.
  const seen = new Set<string>();
  for (const deck of decks) {
    if (seen.has(deck.id)) throw new Error(`Deck ${deck.id} appears more than once in the deck store`);
    seen.add(deck.id);
  }
  return decks;
};

const dateRange = (decks: readonly StoredDeck[]): { minDate: string; maxDate: string } => {
  let minTime = Infinity;
  let maxTime = -Infinity;
  let minDate: string | undefined;
  let maxDate: string | undefined;
  let unparsed = false;
  for (const deck of decks) {
    const time = new Date(deck.date).getTime();
    if (Number.isNaN(time)) {
      unparsed = true;
      continue;
    }
    if (time < minTime) {
      minTime = time;
      minDate = deck.date;
    }
    if (time > maxTime) {
      maxTime = time;
      maxDate = deck.date;
    }
  }
  // An empty group, or one holding an unparseable date, reports no range.
  if (unparsed || minDate === undefined || maxDate === undefined) {
    return { minDate: undefined as unknown as string, maxDate: undefined as unknown as string };
  }
  return { minDate, maxDate };
};

const widen = (entry: ShardEntry | undefined, decks: readonly StoredDeck[], file: string, count: number): ShardEntry => {
  const range = dateRange(decks);
  if (!entry) return { file, count, ...range };
  return {
    file,
    count,
    minDate: new Date(range.minDate) < new Date(entry.minDate) ? range.minDate : entry.minDate,
    maxDate: new Date(range.maxDate) > new Date(entry.maxDate) ? range.maxDate : entry.maxDate,
  };
};

export const groupByShard = (decks: readonly StoredDeck[]): Map<string, StoredDeck[]> => {
  const groups = new Map<string, StoredDeck[]>();
  for (const deck of decks) {
    const id = shardIdForDate(deck.date);
    const group = groups.get(id);
    if (group) group.push(deck);
    else groups.set(id, [deck]);
  }
  return groups;
};

const toLines = (decks: readonly StoredDeck[]): string =>
  decks.map((deck) => `${JSON.stringify(deck)}\n`).join("");

export const planDeckWrites = (dir: string, incoming: readonly StoredDeck[]): Record<string, string> => {
  const manifest = readManifest(dir);
  const files: Record<string, string> = {};

  const batchIds = new Set<string>();
  for (const deck of incoming) {
    if (batchIds.has(deck.id)) throw new Error(`Deck ${deck.id} appears twice in one batch`);
    batchIds.add(deck.id);
  }

  for (const [id, group] of groupByShard(incoming)) {
    const existing = manifest.shards[id];
    const file = existing?.file ?? `${id}.ndjson`;
    const target = path.join(dir, file);
    // A target with no manifest entry is a shard the manifest does not know
    // about. Reading it would append to a file nothing points at, and
    // ignoring it would overwrite it, so refuse and let a verifier decide.
    if (!existing && fs.existsSync(target)) {
      throw new Error(
        `Shard ${id} exists at ${target} but the manifest has no entry for it; run store:verify before writing`
      );
    }
    const previousText = existing ? fs.readFileSync(target, "utf8") : "";
    const knownIds = new Set(parseLines(previousText).map((deck) => deck.id));
    const duplicate = group.find((deck) => knownIds.has(deck.id));
    if (duplicate) {
      throw new Error(`Deck ${duplicate.id} already exists in shard ${id}`);
    }
    files[target] = previousText + toLines(group);
    manifest.shards[id] = widen(existing, group, file, (existing?.count ?? 0) + group.length);
  }

  files[path.join(dir, MANIFEST_FILE)] = `${JSON.stringify(manifest, null, 2)}\n`;
  return files;
};

export interface StoreProblem {
  shard: string;
  message: string;
}

export const verifyStore = (dir: string, options: { placement?: boolean } = {}): StoreProblem[] => {
  const manifest = readManifest(dir);
  const problems: StoreProblem[] = [];
  const seen = new Map<string, string>();
  for (const id of Object.keys(manifest.shards).sort()) {
    const entry = manifest.shards[id];
    const target = path.join(dir, entry.file);
    if (!fs.existsSync(target)) {
      problems.push({ shard: id, message: `missing file ${entry.file}` });
      continue;
    }
    const decks = readShard(dir, entry);
    if (decks.length !== entry.count) {
      problems.push({ shard: id, message: `manifest count ${entry.count} but file holds ${decks.length}` });
    }
    if (decks.length > 0) {
      const range = dateRange(decks);
      // readDecks picks shards by the manifest range, so it has to match the file.
      if (range.minDate !== entry.minDate || range.maxDate !== entry.maxDate) {
        problems.push({
          shard: id,
          message:
            `manifest dates ${entry.minDate} to ${entry.maxDate} but file holds ` +
            `${range.minDate} to ${range.maxDate}`,
        });
      }
    }
    for (const deck of decks) {
      const owner = seen.get(deck.id);
      if (owner) problems.push({ shard: id, message: `deck ${deck.id} also in shard ${owner}` });
      else seen.set(deck.id, id);
      const expected = options.placement ? shardIdForDate(deck.date) : id;
      if (expected !== id) {
        problems.push({ shard: id, message: `deck ${deck.id} dated ${deck.date} belongs in shard ${expected}` });
      }
    }
  }
  const tracked = new Set(Object.values(manifest.shards).map((entry) => entry.file));
  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir).sort()) {
      if (name.endsWith(".ndjson") && !tracked.has(name)) {
        problems.push({ shard: name.slice(0, -".ndjson".length), message: `untracked shard file ${name}` });
      } else if (
        name.endsWith(".tmp") ||
        name.endsWith(".bak") ||
        name.endsWith(".created")
      ) {
        // writeArtefacts stages beside its target, so a leftover means a write stopped partway.
        problems.push({ shard: name, message: `stray staging file ${name}` });
      }
    }
  }
  return problems;
};
