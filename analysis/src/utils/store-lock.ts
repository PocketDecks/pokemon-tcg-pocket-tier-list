import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

export const lockFileFor = (dir: string): string => `${dir}.lock`;

const claimDirectoryFor = (lockFile: string): string => `${lockFile}.claims`;

export const LOCK_CONTENT_GRACE_MS = 5_000;

const ACQUIRE_ATTEMPTS = 5;

const isRunning = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
};

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

const removeClaim = (lockFile: string, claim: string): void => {
  fs.rmSync(claim, { force: true });
  const claimsDir = claimDirectoryFor(lockFile);
  try {
    fs.rmdirSync(claimsDir);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EPERM") {
      let entries: string[];
      try {
        entries = fs.readdirSync(claimsDir);
      } catch (inspectError) {
        if ((inspectError as NodeJS.ErrnoException).code === "ENOENT") return;
        throw inspectError;
      }
      if (entries.length > 0) return;
      try {
        fs.rmdirSync(claimsDir);
        return;
      } catch (retryError) {
        const retryCode = (retryError as NodeJS.ErrnoException).code;
        if (retryCode === "ENOENT" || retryCode === "ENOTEMPTY" || retryCode === "EEXIST") return;
        if (retryCode === "EPERM") {
          let retryEntries: string[];
          try {
            retryEntries = fs.readdirSync(claimsDir);
          } catch (inspectError) {
            if ((inspectError as NodeJS.ErrnoException).code === "ENOENT") return;
            throw inspectError;
          }
          if (retryEntries.length > 0) return;
        }
        throw retryError;
      }
    }
    if (code !== "ENOENT" && code !== "ENOTEMPTY" && code !== "EEXIST") throw error;
  }
};

const removeStaleClaims = (lockFile: string, ownClaim: string): void => {
  const claimsDir = claimDirectoryFor(lockFile);
  const entries = fs.readdirSync(claimsDir, { withFileTypes: true });
  for (const entry of entries) {
    const candidate = path.join(claimsDir, entry.name);
    if (candidate === ownClaim) continue;
    if (!entry.isFile()) throw new Error(`Store lock claim ${candidate} is not a file`);

    const contents = readLockContents(candidate);
    if (contents === undefined) continue;

    const namedPid = pidFrom(entry.name.split("-", 1)[0]);
    const contentPid = pidFrom(contents);
    if (namedPid !== undefined && contentPid !== undefined && namedPid !== contentPid) {
      throw new Error(`Store lock claim ${candidate} has conflicting owner pids`);
    }
    const held = namedPid ?? contentPid;
    if (held !== undefined) {
      if (isRunning(held)) throw new Error(heldMessage(lockFile, String(held)));
    } else {
      const age = lockAgeMs(candidate);
      if (age === undefined) continue;
      if (age < LOCK_CONTENT_GRACE_MS) throw new Error(heldMessage(lockFile, contents));
    }

    warnReclaim(lockFile, held === undefined ? contents : String(held));
    fs.rmSync(candidate, { force: true });
  }
};

const writeClaim = (lockFile: string, claim: string): boolean => {
  let fd: number;
  try {
    fd = fs.openSync(claim, "wx");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "EEXIST") return false;
    throw error;
  }
  try {
    try {
      fs.writeSync(fd, String(process.pid));
    } finally {
      fs.closeSync(fd);
    }
  } catch (error) {
    removeClaim(lockFile, claim);
    throw error;
  }
  return true;
};

const createClaim = (lockFile: string): string => {
  const claimsDir = claimDirectoryFor(lockFile);
  for (let attempt = 0; attempt < ACQUIRE_ATTEMPTS; attempt += 1) {
    try {
      fs.mkdirSync(claimsDir, { recursive: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    const claim = path.join(claimsDir, `${process.pid}-${randomUUID()}`);
    if (!writeClaim(lockFile, claim)) continue;

    try {
      removeStaleClaims(lockFile, claim);
      if (readLockContents(claim) !== String(process.pid)) {
        removeClaim(lockFile, claim);
        continue;
      }
      return claim;
    } catch (error) {
      removeClaim(lockFile, claim);
      throw error;
    }
  }

  throw new Error(heldMessage(lockFile, ""));
};

type ReclaimOutcome = "claimed" | "held" | "raced";

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
    fs.renameSync(claimed, lockFile);
    return "held";
  }

  fs.rmSync(claimed, { force: true });
  warnReclaim(lockFile, inspected);
  return "claimed";
};

const acquire = (lockFile: string): string => {
  const claim = createClaim(lockFile);
  try {
    for (let attempt = 0; attempt < ACQUIRE_ATTEMPTS; attempt += 1) {
      if (tryCreate(lockFile)) return claim;

      const contents = readLockContents(lockFile);
      if (contents === undefined) continue;

      const held = pidFrom(contents);
      if (held !== undefined && isRunning(held)) throw new Error(heldMessage(lockFile, contents));

      if (held === undefined) {
        const age = lockAgeMs(lockFile);
        if (age === undefined) continue;
        if (age < LOCK_CONTENT_GRACE_MS) throw new Error(heldMessage(lockFile, contents));
      }

      const outcome = reclaimStale(lockFile, contents);
      if (outcome === "held") {
        throw new Error(heldMessage(lockFile, readLockContents(lockFile) ?? contents));
      }
    }

    throw new Error(heldMessage(lockFile, readLockContents(lockFile) ?? ""));
  } catch (error) {
    removeClaim(lockFile, claim);
    throw error;
  }
};

const release = (lockFile: string): void => {
  const contents = readLockContents(lockFile);
  if (contents === undefined || pidFrom(contents) !== process.pid) return;
  fs.rmSync(lockFile, { force: true });
};

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const releaseAndRemoveClaim = (lockFile: string, claim: string): unknown[] => {
  const errors: unknown[] = [];
  try {
    release(lockFile);
  } catch (error) {
    errors.push(error);
  }
  try {
    removeClaim(lockFile, claim);
  } catch (error) {
    errors.push(error);
  }
  return errors;
};

export const withStoreLock = <T>(dir: string, fn: () => T): T => {
  const lockFile = lockFileFor(dir);
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  const claim = acquire(lockFile);
  let result: T;
  try {
    result = fn();
  } catch (callbackError) {
    const cleanupErrors = releaseAndRemoveClaim(lockFile, claim);
    if (cleanupErrors.length === 0) throw callbackError;
    throw new AggregateError(
      [callbackError, ...cleanupErrors],
      `${errorMessage(callbackError)}; store lock cleanup also failed`
    );
  }
  const cleanupErrors = releaseAndRemoveClaim(lockFile, claim);
  if (cleanupErrors.length === 1) throw cleanupErrors[0];
  if (cleanupErrors.length > 1) {
    throw new AggregateError(
      cleanupErrors,
      `store lock cleanup failed: ${cleanupErrors.map(errorMessage).join("; ")}`
    );
  }
  return result;
};
