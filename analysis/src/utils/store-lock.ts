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

const acquire = (lockFile: string): void => {
  try {
    fs.writeFileSync(lockFile, String(process.pid), { flag: "wx" });
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }

  const held = Number.parseInt(fs.readFileSync(lockFile, "utf8").trim(), 10);
  // A writer records a positive pid, and pid 0 signals the whole process
  // group, so process.kill(0, 0) reports success. Only a positive pid can
  // name a live writer, so anything else is stale.
  if (Number.isInteger(held) && held > 0 && isRunning(held)) {
    throw new Error(
      `Store lock ${lockFile} is held by process ${held}; wait for that run ` +
        `to finish, or remove the lock file if the process is gone`
    );
  }

  // A killed run leaves its lock behind. Taking over a pid that no longer
  // answers keeps the store usable after such a run.
  console.warn(`Store lock ${lockFile} holds pid ${held}, which is not running; reclaiming it`);
  fs.writeFileSync(lockFile, String(process.pid));
};

export const withStoreLock = <T>(dir: string, fn: () => T): T => {
  const lockFile = lockFileFor(dir);
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  acquire(lockFile);
  try {
    return fn();
  } finally {
    fs.rmSync(lockFile, { force: true });
  }
};
