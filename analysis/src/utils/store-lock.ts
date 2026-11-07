import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

export const lockFileFor = (dir: string): string => `${path.resolve(dir)}.lock`;

const claimDirectoryFor = (lockFile: string): string => `${lockFile}.claims`;

export const LOCK_CONTENT_GRACE_MS = 5_000;

const ACQUIRE_ATTEMPTS = 5;

const ownClaimsKey = Symbol.for("pokemon-tcg-pocket.store-lock.own-claims");
const sharedWithOwnClaims = globalThis as typeof globalThis & { [ownClaimsKey]?: Set<string> };
const ownClaims: Set<string> = (sharedWithOwnClaims[ownClaimsKey] ??= new Set<string>());

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

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

const claimHeldMessage = (claim: string, held: number | undefined, retry: boolean): string => {
  const holder = held === undefined ? "has not written its pid yet" : `is held by process ${held}`;
  const suffix = retry ? "; another run is starting, so retry shortly" : "";
  return (
    `Store lock claim ${claim} ${holder}; wait for that run to finish, ` +
    `or remove that claim file if the process is gone${suffix}`
  );
};

const ownClaimHeldMessage = (claim: string, held: number): string =>
  `Store lock claim ${claim} is held by process ${held}, which is this process: a store lock call is still running in it; ` +
  "the claim clears when that call ends";

const claimMismatchMessage = (claim: string): string =>
  `Store lock claim ${claim} did not read back this process's pid`;

const changingMessage = (lockFile: string): string =>
  `Store lock ${lockFile} kept changing while this run was acquiring it, so retry the run`;

const warnReclaim = (lockFile: string, contents: string): void => {
  const held = pidFrom(contents);
  const holder =
    held === undefined
      ? "no pid"
      : held === process.pid
        ? `pid ${held}, which is this process and holds no claim`
        : `pid ${held}, which is not running`;
  console.warn(`Store lock ${lockFile} holds ${holder}; reclaiming it`);
};

const writePidAndClose = (fd: number): void => {
  let writeFailure: { error: unknown } | undefined;
  try {
    fs.writeFileSync(fd, String(process.pid));
  } catch (error) {
    writeFailure = { error };
  }
  try {
    fs.closeSync(fd);
  } catch (closeError) {
    if (writeFailure === undefined) throw closeError;
    throw new AggregateError(
      [writeFailure.error, closeError],
      `${errorMessage(writeFailure.error)}; closing the store lock file also failed`
    );
  }
  if (writeFailure !== undefined) throw writeFailure.error;
};

const tryCreate = (lockFile: string): boolean => {
  let fd: number;
  try {
    fd = fs.openSync(lockFile, "wx");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    return false;
  }
  try {
    writePidAndClose(fd);
  } catch (error) {
    throw failedWithCleanup(error, () => fs.rmSync(lockFile, { force: true }));
  }
  return true;
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

const entriesIfPresent = (claimsDir: string): string[] | undefined => {
  try {
    return fs.readdirSync(claimsDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
};

const removeEmptyClaimsDirectory = (claimsDir: string): void => {
  try {
    fs.rmdirSync(claimsDir);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EPERM") {
      const entries = entriesIfPresent(claimsDir);
      if (entries === undefined || entries.length > 0) return;
      try {
        fs.rmdirSync(claimsDir);
        return;
      } catch (retryError) {
        const retryCode = (retryError as NodeJS.ErrnoException).code;
        if (retryCode === "ENOENT" || retryCode === "ENOTEMPTY" || retryCode === "EEXIST") return;
        if (retryCode === "EPERM") {
          const retryEntries = entriesIfPresent(claimsDir);
          if (retryEntries === undefined || retryEntries.length > 0) return;
        }
        throw retryError;
      }
    }
    if (code !== "ENOENT" && code !== "ENOTEMPTY" && code !== "EEXIST") throw error;
  }
};

const removeClaim = (lockFile: string, claim: string): void => {
  try {
    fs.rmSync(claim, { force: true });
  } finally {
    ownClaims.delete(claim);
  }
  const claimsDir = claimDirectoryFor(lockFile);
  try {
    removeEmptyClaimsDirectory(claimsDir);
  } catch (error) {
    console.warn(
      `Store lock claims directory ${claimsDir} could not be removed (${(error as NodeJS.ErrnoException).code}); leaving it in place`
    );
  }
};

const cleanupFailedLabel = "; store lock cleanup also failed";

const withCleanupFailed = (message: string, cleanupMessages: string[]): string => {
  const labelAt = message.indexOf(cleanupFailedLabel);
  const base = labelAt === -1 ? message : message.slice(0, labelAt);
  const named = labelAt === -1 ? [] : [message.slice(labelAt + cleanupFailedLabel.length + ": ".length)];
  return `${base}${cleanupFailedLabel}: ${[...named, ...cleanupMessages].join("; ")}`;
};

const withCleanupErrors = (error: unknown, cleanupErrors: unknown[]): AggregateError => {
  const originals = error instanceof AggregateError ? error.errors : [error];
  const message = error instanceof AggregateError ? error.message : errorMessage(error);
  return new AggregateError(
    [...originals, ...cleanupErrors],
    withCleanupFailed(message, cleanupErrors.map(errorMessage))
  );
};

const failedWithCleanup = (error: unknown, cleanup: () => void): unknown => {
  try {
    cleanup();
  } catch (cleanupError) {
    return withCleanupErrors(error, [cleanupError]);
  }
  return error;
};

const isYoung = (file: string): boolean => {
  const age = lockAgeMs(file);
  return age !== undefined && age < LOCK_CONTENT_GRACE_MS;
};

const blocksReclaim = (lockFile: string, contents: string): boolean => {
  const held = pidFrom(contents);
  if (held === process.pid) return false;
  if (held !== undefined) return isRunning(held);
  return isYoung(lockFile);
};

const lockIsAbsent = (lockFile: string): boolean => {
  try {
    return readLockContents(lockFile) === undefined;
  } catch {
    return false;
  }
};

const removeStaleClaims = (lockFile: string, ownClaim: string): void => {
  const claimsDir = claimDirectoryFor(lockFile);
  const entries = fs.readdirSync(claimsDir, { withFileTypes: true });
  for (const entry of entries) {
    const candidate = path.join(claimsDir, entry.name);
    if (candidate === ownClaim) continue;
    if (!entry.isFile()) continue;

    const contents = readLockContents(candidate);
    if (contents === undefined) continue;

    const namedPid = pidFrom(entry.name.split("-", 1)[0]);
    const contentPid = pidFrom(contents);
    if (namedPid !== undefined && contentPid !== undefined && namedPid !== contentPid) {
      throw new Error(`Store lock claim ${candidate} has conflicting owner pids`);
    }
    const held = namedPid ?? contentPid;
    if (held === process.pid) {
      if (ownClaims.has(candidate)) throw new Error(ownClaimHeldMessage(candidate, held));
      console.warn(`Store lock claim ${candidate} names this process but was not created by it; reclaiming it`);
      fs.rmSync(candidate, { force: true });
      continue;
    }
    if (held !== undefined) {
      if (isRunning(held)) {
        const lockAbsent = lockIsAbsent(lockFile);
        throw new Error(claimHeldMessage(candidate, held, lockAbsent && isYoung(candidate)));
      }
    } else {
      const age = lockAgeMs(candidate);
      if (age === undefined) continue;
      if (age < LOCK_CONTENT_GRACE_MS) {
        const lockAbsent = lockIsAbsent(lockFile);
        throw new Error(claimHeldMessage(candidate, undefined, lockAbsent));
      }
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
  ownClaims.add(claim);
  try {
    writePidAndClose(fd);
  } catch (error) {
    throw failedWithCleanup(error, () => removeClaim(lockFile, claim));
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

    let owned: boolean;
    try {
      removeStaleClaims(lockFile, claim);
      owned = readLockContents(claim) === String(process.pid);
    } catch (error) {
      throw failedWithCleanup(error, () => removeClaim(lockFile, claim));
    }
    if (!owned) {
      const mismatch = new Error(claimMismatchMessage(claim));
      const failure = failedWithCleanup(mismatch, () => removeClaim(lockFile, claim));
      if (failure !== mismatch) throw failure;
      continue;
    }
    return claim;
  }

  throw new Error(changingMessage(lockFile));
};

const reclaimStale = (lockFile: string, inspected: string): string | undefined => {
  const current = readLockContents(lockFile);
  if (current === undefined) return undefined;
  if (current !== inspected) return blocksReclaim(lockFile, current) ? current : undefined;

  fs.rmSync(lockFile, { force: true });
  warnReclaim(lockFile, inspected);
  return undefined;
};

const acquire = (lockFile: string): string => {
  const claim = createClaim(lockFile);
  try {
    for (let attempt = 0; attempt < ACQUIRE_ATTEMPTS; attempt += 1) {
      if (tryCreate(lockFile)) return claim;

      const contents = readLockContents(lockFile);
      if (contents === undefined) continue;

      if (blocksReclaim(lockFile, contents)) throw new Error(heldMessage(lockFile, contents));

      const heldBy = reclaimStale(lockFile, contents);
      if (heldBy !== undefined) throw new Error(heldMessage(lockFile, heldBy));
    }

    throw new Error(changingMessage(lockFile));
  } catch (error) {
    throw failedWithCleanup(error, () => removeClaim(lockFile, claim));
  }
};

const release = (lockFile: string): void => {
  const contents = readLockContents(lockFile);
  if (contents === undefined || pidFrom(contents) !== process.pid) return;
  fs.rmSync(lockFile, { force: true });
};

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

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  typeof (value as { then?: unknown } | null)?.then === "function";

export type SyncResult<T> = T extends PromiseLike<unknown> ? never : unknown;

export const withStoreLock = <T>(dir: string, fn: () => T & SyncResult<T>): T => {
  const lockFile = lockFileFor(dir);
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  const claim = acquire(lockFile);
  let result: T;
  try {
    result = fn();
    if (isThenable(result)) {
      Promise.resolve(result).catch((rejection: unknown) => {
        console.error(`Store lock callback returned a promise that later rejected: ${errorMessage(rejection)}`);
      });
      throw new TypeError("store lock callback must be synchronous, but it returned a promise");
    }
  } catch (callbackError) {
    const cleanupErrors = releaseAndRemoveClaim(lockFile, claim);
    if (cleanupErrors.length === 0) throw callbackError;
    throw withCleanupErrors(callbackError, cleanupErrors);
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
