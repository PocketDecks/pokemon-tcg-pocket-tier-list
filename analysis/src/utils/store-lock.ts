import fs from "fs";
import path from "path";

// Two writers that read the store, plan a change and then write it back can
// interleave: each read lands before the other write, so the second writer
// builds on a stale read and discards the first writer's work. The downloader
// and the format purge are both that shape, so both hold this lock across
// their read-modify-write.
//
// The lock file sits beside the store directory, where the store verifier and
// the shard readers cannot see it.

export const lockFileFor = (dir: string): string => `${dir}.lock`;

// A writer that has just created the lock file has not written its pid yet, so
// an empty or unparsable file counts as held until its mtime is this old.
export const LOCK_CONTENT_GRACE_MS = 5_000;

// A holder can release the lock between a failed create and the read that
// follows, which leaves nothing to inspect, so the create is worth retrying.
const ACQUIRE_ATTEMPTS = 5;

// A pid this process cannot signal may still be running under another account,
// so only ESRCH proves the process is gone.
const isRunning = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
};

// A writer records a positive pid, and pid 0 signals the whole process group,
// so process.kill(0, 0) reports success. Only a positive pid names a writer.
const pidFrom = (contents: string): number | undefined => {
  const held = Number.parseInt(contents.trim(), 10);
  return Number.isInteger(held) && held > 0 ? held : undefined;
};

const heldMessage = (lockFile: string, contents: string): string => {
  const held = pidFrom(contents);
  const holder = held === undefined ? "a process that has not written its pid yet" : `process ${held}`;
  return (
    `Store lock ${lockFile} is held by ${holder}; wait for that run to finish, ` +
    `or remove the lock file if the process is gone`
  );
};

const warnReclaim = (lockFile: string, contents: string): void => {
  const held = Number.parseInt(contents.trim(), 10);
  const holder = Number.isInteger(held) ? `pid ${held}, which is not running` : "no pid";
  console.warn(`Store lock ${lockFile} holds ${holder}; reclaiming it`);
};

const tryCreate = (lockFile: string): boolean => {
  try {
    fs.writeFileSync(lockFile, String(process.pid), { flag: "wx" });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    return false;
  }
};

// undefined means the file is gone, which is not an error: the holder may have
// released it since the failed create.
const readLockContents = (lockFile: string): string | undefined => {
  try {
    return fs.readFileSync(lockFile, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
};

const lockAgeMs = (lockFile: string): number | undefined => {
  try {
    return Date.now() - fs.statSync(lockFile).mtimeMs;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
};

type ReclaimOutcome = "claimed" | "held" | "raced";

// Claiming a stale lock starts by renaming it aside. A writer that replaces
// the file between the inspection read and this rename keeps its own lock
// file, and re-reading the renamed file shows that change: different contents
// mean the file this call moved was that writer's replacement, so it goes back
// under its own name and counts as held.
const reclaimStale = (lockFile: string, inspected: string): ReclaimOutcome => {
  const claimed = `${lockFile}.${process.pid}.reclaim`;
  try {
    fs.renameSync(lockFile, claimed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "raced";
    throw error;
  }

  const moved = fs.readFileSync(claimed, "utf8");
  if (moved !== inspected) {
    try {
      fs.renameSync(claimed, lockFile);
    } catch {
      // Another writer took the name again; its lock file stays where it is.
    }
    return "held";
  }

  fs.rmSync(claimed, { force: true });
  warnReclaim(lockFile, inspected);
  return "claimed";
};

const acquire = (lockFile: string): void => {
  for (let attempt = 0; attempt < ACQUIRE_ATTEMPTS; attempt += 1) {
    if (tryCreate(lockFile)) return;

    const contents = readLockContents(lockFile);
    if (contents === undefined) continue;

    const held = pidFrom(contents);
    if (held !== undefined && isRunning(held)) throw new Error(heldMessage(lockFile, contents));

    // A writer records its pid immediately after the create, so contents that
    // name no writer belong to a writer still inside that window until the
    // file is older than the grace period.
    if (held === undefined) {
      const age = lockAgeMs(lockFile);
      if (age === undefined) continue;
      if (age < LOCK_CONTENT_GRACE_MS) throw new Error(heldMessage(lockFile, contents));
    }

    // A killed run leaves its lock behind. Taking over a file that no writer
    // answers for keeps the store usable after such a run.
    if (reclaimStale(lockFile, contents) === "held") {
      throw new Error(heldMessage(lockFile, readLockContents(lockFile) ?? contents));
    }
    // The stale file is gone, so the next pass can create the lock.
  }

  throw new Error(heldMessage(lockFile, readLockContents(lockFile) ?? ""));
};

// A lock reclaimed by another process holds that process's pid now, so this
// process removes the file only while it still holds its own.
const release = (lockFile: string): void => {
  const contents = readLockContents(lockFile);
  if (contents === undefined || pidFrom(contents) !== process.pid) return;
  fs.rmSync(lockFile, { force: true });
};

export const withStoreLock = <T>(dir: string, fn: () => T): T => {
  const lockFile = lockFileFor(dir);
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  acquire(lockFile);
  try {
    return fn();
  } finally {
    release(lockFile);
  }
};
