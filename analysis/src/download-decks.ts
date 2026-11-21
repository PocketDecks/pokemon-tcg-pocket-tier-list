import "./load-env-side-effect";
import fs from "fs";
import path from "path";
import { EXPANSION_RELEASE_DATE } from "./settings";
import { getTournaments } from "./utils/get-tournaments";
import getTournamentDecks from "./utils/get-tournament-decks";
import { mapWithConcurrency } from "./utils/limitless-client";
import { MANIFEST_FILE, findStagingFiles, interruptedWriteMessage, planDeckWrites } from "./utils/deck-store";
import { decksDir, processedFile } from "./utils/data-paths";
import { round } from "./utils/round";
import { writeArtefacts } from "./utils/write-artifacts";
import { StoreLockBusyError, SyncResult, withStoreLock } from "./utils/store-lock";

export const BATCH_SIZE = 20;
export const CONCURRENCY = 3;

export interface LockWait {
  retries: number;
  delayMs: number;
}

const LOCK_WAIT: LockWait = { retries: 8, delayMs: 250 };

const MAX_LOCK_DELAY_MS = 5_000;

export const lockDelays = ({ retries, delayMs }: LockWait): number[] =>
  Array.from({ length: retries }, (_, retry) => Math.min(delayMs * 2 ** retry, MAX_LOCK_DELAY_MS));

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const withStoreLockWaiting = async <T>(wait: LockWait, fn: () => T & SyncResult<T>): Promise<T> => {
  const delays = lockDelays(wait);
  for (const [attempt, delay] of delays.entries()) {
    try {
      return withStoreLock(decksDir(), fn);
    } catch (error) {
      if (!(error instanceof StoreLockBusyError)) throw error;
      if (attempt === 0) {
        const seconds = Math.ceil(delays.reduce((total, wait) => total + wait, 0) / 1000);
        console.warn(`The store lock is busy; waiting up to ${seconds}s for it`);
      }
      await sleep(delay);
    }
  }
  return withStoreLock(decksDir(), fn);
};

export const readProcessed = (): unknown[] => {
  const file = processedFile();
  const hasStore = fs.existsSync(path.join(decksDir(), MANIFEST_FILE));
  if (!fs.existsSync(file)) {
    if (hasStore) {
      throw new Error("The deck store and processed-tournaments.json must exist together");
    }
    return [];
  }
  const value = JSON.parse(fs.readFileSync(file, "utf-8"));
  if (!Array.isArray(value)) throw new Error(`${file} must contain an array`);
  if (value.length > 0 && !hasStore) {
    throw new Error("The deck store and processed-tournaments.json must exist together");
  }
  return value;
};

const idOf = (entry: unknown): unknown => (entry as { id?: unknown }).id;

const SINCE_FLAG = "--since";
const SINCE_USAGE = `${SINCE_FLAG} takes a date as YYYY-MM-DD, or "release"`;

export const parseSince = (value: string): Date => {
  if (value === "release") return EXPANSION_RELEASE_DATE;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match) {
    const [year, month, day] = match.slice(1).map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCMonth() === month - 1 && date.getUTCDate() === day) return date;
  }
  throw new Error(`Invalid ${SINCE_FLAG} value "${value}": ${SINCE_USAGE}`);
};

export const parseArgs = (argv: readonly string[]): { since?: Date } => {
  const index = argv.findIndex((arg) => arg === SINCE_FLAG || arg.startsWith(`${SINCE_FLAG}=`));
  if (index === -1) return {};
  const inline = argv[index].startsWith(`${SINCE_FLAG}=`);
  const value = inline ? argv[index].slice(SINCE_FLAG.length + 1) : argv[index + 1];
  if (value === undefined) throw new Error(`Missing value for ${SINCE_FLAG}: ${SINCE_USAGE}`);
  return { since: parseSince(value) };
};

export const downloadDecks = async ({
  lockWait = LOCK_WAIT,
  ...filter
}: { since?: Date; lockWait?: LockWait } = {}) => {
  const tournaments = await getTournaments(filter);
  console.log(`Downloaded tournaments\n${tournaments.length} to process`);

  await withStoreLockWaiting(lockWait, () => {
    readProcessed();
  });
  fs.mkdirSync(decksDir(), { recursive: true });

  for (let start = 0; start < tournaments.length; start += BATCH_SIZE) {
    const batch = tournaments.slice(start, start + BATCH_SIZE);
    const downloaded = await mapWithConcurrency(batch, CONCURRENCY, (tournament) =>
      getTournamentDecks(tournament)
    );

    // The batch read inside planDeckWrites and the write that follows are one
    // read-modify-write, so the lock holds both; a purge rewriting the same
    // shards cannot land between them.
    await withStoreLockWaiting(lockWait, () => {
      const stale = findStagingFiles(decksDir(), processedFile());
      if (stale.length > 0) throw new Error(interruptedWriteMessage(stale));
      const processed = readProcessed();
      const recorded = new Set(processed.map(idOf));
      const fresh = batch.flatMap((tournament, index) =>
        recorded.has(tournament.id) ? [] : [{ tournament, decks: downloaded[index] }]
      );
      if (fresh.length === 0) return;
      writeArtefacts({
        ...planDeckWrites(decksDir(), fresh.flatMap(({ decks }) => decks)),
        [processedFile()]: JSON.stringify([
          ...processed,
          ...fresh.map(({ tournament }) => ({ id: tournament.id, date: tournament.date })),
        ]),
      });
    });

    console.log(`${round((Math.min(start + BATCH_SIZE, tournaments.length) / tournaments.length) * 100, 2)}%`);
  }
};

if (require.main === module) {
  Promise.resolve()
    .then(() => downloadDecks(parseArgs(process.argv.slice(2))))
    .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
