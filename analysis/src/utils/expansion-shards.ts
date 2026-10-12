import expansions from "pokemon-tcg-pocket-cards/data/v5/expansions.json";
import { DELUXE_SET_IDS } from "../settings";

export const PRE_LAUNCH_SHARD = "pre";

export interface ShardWindow {
  id: string;
  start: number;
}

interface ExpansionRow {
  id: string;
  release_date: string | null;
}

export const buildShardWindows = (
  list: readonly ExpansionRow[],
  excluded: ReadonlySet<string> = DELUXE_SET_IDS
): ShardWindow[] =>
  list
    .filter((row) => row.release_date && !excluded.has(row.id))
    .map((row) => ({ id: row.id, start: new Date(row.release_date as string).getTime() }))
    .sort((a, b) => a.start - b.start);

export const SHARD_WINDOWS: ShardWindow[] = buildShardWindows(expansions as ExpansionRow[]);

export const shardIdForDate = (
  iso: string,
  windows: readonly ShardWindow[] = SHARD_WINDOWS
): string => {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) {
    throw new Error(`Cannot shard a deck with an invalid date: ${iso}`);
  }
  let found = PRE_LAUNCH_SHARD;
  for (const window of windows) {
    if (time < window.start) break;
    found = window.id;
  }
  return found;
};
