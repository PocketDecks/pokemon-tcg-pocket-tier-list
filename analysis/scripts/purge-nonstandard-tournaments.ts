// Removes non-standard tournaments from the deck store. It is a dry run by
// default; --apply rewrites each affected shard and the manifest. Removed
// tournaments stay in processed-tournaments.json, so the downloader never
// fetches them again and this is the only way to clear the stored ones.
import "../src/load-env-side-effect";
import path from "path";
import {
  MANIFEST_FILE,
  Manifest,
  readManifest,
  readShard,
  toLines,
} from "../src/utils/deck-store";
import { EXPANSION_RELEASE_DATE } from "../src/settings";
import { Deck, Tournament } from "../src/utils/types";
import { decksDir } from "../src/utils/data-paths";
import { fetchLimitless, mapWithConcurrency } from "../src/utils/limitless-client";
import {
  isStandardListing,
  nonStandardReason,
  TournamentDetails,
} from "../src/utils/tournament-format";
import { writeArtefacts } from "../src/utils/write-artifacts";

export const CONCURRENCY = 3;
export const GAME = "POCKET";
export const LISTING_LIMIT = 10000;

// The listing carries the format and the display fields the dry run prints.
interface ListingTournament extends Tournament {
  name?: string;
}

interface DetailsResponse extends TournamentDetails {
  name?: unknown;
  date?: unknown;
}

export interface PurgeOptions {
  dir: string;
  apply?: boolean;
}

export interface PurgeEntry {
  id: string;
  date: string;
  name: string;
  reason: string;
  deckCount: number;
}

interface ScopedShard {
  id: string;
  file: string;
  decks: Deck[];
}

// A deck id is `${tournament.id}-${deck.player}`, so the tournament id is the
// text before the first dash. A fixed slice would bake in the current id
// length, which is not part of the deck id contract.
export const tournamentIdOf = (deckId: string): string => {
  const dash = deckId.indexOf("-");
  return dash === -1 ? deckId : deckId.slice(0, dash);
};

// The shards readDecks would read for the current expansion, kept with their
// decks so an affected shard can be rewritten.
const readScopedShards = (dir: string): ScopedShard[] => {
  const manifest = readManifest(dir);
  const since = EXPANSION_RELEASE_DATE.getTime();
  return Object.keys(manifest.shards)
    .sort()
    .filter((id) => new Date(manifest.shards[id].maxDate).getTime() >= since)
    .map((id) => ({
      id,
      file: manifest.shards[id].file,
      decks: readShard(dir, manifest.shards[id]),
    }));
};

const dateRange = (decks: readonly Deck[]): { minDate: string; maxDate: string } => {
  let minTime = Infinity;
  let maxTime = -Infinity;
  let minDate = "";
  let maxDate = "";
  for (const deck of decks) {
    const time = new Date(deck.date).getTime();
    if (Number.isNaN(time)) continue;
    if (time < minTime) {
      minTime = time;
      minDate = deck.date;
    }
    if (time > maxTime) {
      maxTime = time;
      maxDate = deck.date;
    }
  }
  return { minDate, maxDate };
};

const stringField = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

export const purgeNonStandardTournaments = async ({
  dir,
  apply = false,
}: PurgeOptions): Promise<PurgeEntry[]> => {
  const shards = readScopedShards(dir);

  const grouped = new Map<string, Deck[]>();
  for (const deck of shards.flatMap((shard) => shard.decks)) {
    const id = tournamentIdOf(deck.id);
    const group = grouped.get(id);
    if (group) group.push(deck);
    else grouped.set(id, [deck]);
  }

  const listing = await fetchLimitless<ListingTournament[]>("/tournaments", {
    limit: LISTING_LIMIT,
    game: GAME,
  });
  const listingById = new Map(listing.map((row) => [row.id, row]));

  const ids = [...grouped.keys()].sort();
  const detailsById = new Map<string, DetailsResponse>();
  await mapWithConcurrency(ids, CONCURRENCY, async (id) => {
    const details = await fetchLimitless<DetailsResponse>(`/tournaments/${id}/details`);
    detailsById.set(id, details);
    return details;
  });

  const entries: PurgeEntry[] = [];
  for (const id of ids) {
    const listingRow = listingById.get(id);
    const details = detailsById.get(id) ?? {};
    // The id is merged in so a malformed details error names the tournament.
    // A tournament the listing omits counts by its details alone.
    const reason =
      listingRow && !isStandardListing(listingRow)
        ? `format ${listingRow.format}`
        : nonStandardReason({ ...details, id });
    if (!reason) continue;
    const group = grouped.get(id) as Deck[];
    entries.push({
      id,
      date: listingRow?.date ?? stringField(details.date) ?? group[0]?.date ?? "",
      name: listingRow?.name ?? stringField(details.name) ?? "",
      reason,
      deckCount: group.length,
    });
  }

  for (const entry of entries) {
    console.log(
      `remove ${entry.id} ${entry.date} ${entry.name}: ${entry.reason} (${entry.deckCount} decks)`
    );
  }
  const totalDecks = entries.reduce((sum, entry) => sum + entry.deckCount, 0);
  console.log(`total ${entries.length} tournaments, ${totalDecks} decks`);

  if (!apply || entries.length === 0) return entries;

  const removed = new Set(entries.map((entry) => entry.id));
  const affected = shards
    .map((shard) => ({
      shard,
      kept: shard.decks.filter((deck) => !removed.has(tournamentIdOf(deck.id))),
    }))
    .filter(({ shard, kept }) => kept.length !== shard.decks.length);

  // A shard with nothing left would leave a manifest entry no file can fill,
  // so refuse before the first write.
  for (const { shard, kept } of affected) {
    if (kept.length === 0) {
      throw new Error(`Shard ${shard.id} would be emptied by the purge; nothing written`);
    }
  }

  const manifest = readManifest(dir);
  const nextManifest: Manifest = { schema: 1, shards: { ...manifest.shards } };
  const files: Record<string, string> = {};

  for (const { shard, kept } of affected) {
    const range = dateRange(kept);
    nextManifest.shards[shard.id] = {
      file: shard.file,
      count: kept.length,
      minDate: range.minDate,
      maxDate: range.maxDate,
    };
    files[path.join(dir, shard.file)] = toLines(kept);
  }

  files[path.join(dir, MANIFEST_FILE)] = `${JSON.stringify(nextManifest, null, 2)}\n`;
  writeArtefacts(files);

  return entries;
};

const argument = (flag: string, fallback: string): string => {
  const index = process.argv.indexOf(flag);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};

if (process.argv[1]?.endsWith("purge-nonstandard-tournaments.ts")) {
  purgeNonStandardTournaments({
    dir: argument("--dir", decksDir()),
    apply: process.argv.includes("--apply"),
  }).catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
