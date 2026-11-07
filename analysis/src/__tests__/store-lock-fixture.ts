import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { pathToFileURL } from "url";
import { vi } from "vitest";
import { Worker } from "worker_threads";
import { LOCK_CONTENT_GRACE_MS, lockFileFor } from "../utils/store-lock";

export const deadPid = (): number => {
  const child = spawnSync(process.execPath, ["-e", ""]);
  if (child.pid === undefined) throw new Error("could not spawn a child to obtain a dead pid");
  return child.pid;
};

export const liveForeignPid = (): number => {
  const parent = process.ppid;
  expect(parent).not.toBe(process.pid);
  expect(() => process.kill(parent, 0)).not.toThrow();
  return parent;
};

export const backdate = (file: string): void => {
  const old = new Date(Date.now() - LOCK_CONTENT_GRACE_MS * 2);
  fs.utimesSync(file, old, old);
};

const ownClaimsKey = Symbol.for("pokemon-tcg-pocket.store-lock.own-claims");

const storeLockUrl = pathToFileURL(path.resolve(__dirname, "../utils/store-lock.ts")).href;

const workerSource = `
const { parentPort, workerData } = require("node:worker_threads");
(async () => {
  const { withStoreLock } = await import(workerData.moduleUrl);
  let ran = false;
  let message;
  try {
    withStoreLock(workerData.store, () => {
      ran = true;
      return "ran";
    });
  } catch (error) {
    message = error.message;
  }
  parentPort.postMessage({ ran, message });
})();
`;

export const runInWorker = (store: string): Promise<{ ran: boolean; message?: string }> =>
  new Promise((resolve, reject) => {
    const worker = new Worker(workerSource, { eval: true, workerData: { moduleUrl: storeLockUrl, store } });
    worker.once("message", (outcome: { ran: boolean; message?: string }) => resolve(outcome));
    worker.once("error", reject);
    worker.once("exit", (code) => reject(new Error(`store lock worker exited with code ${code} before reporting`)));
  });

export const thrownMessage = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("expected the run to throw");
};

interface StoreLockFixture {
  dir: string;
  store: string;
  lockFile: string;
  claimEntries(): string[];
  reclaimFiles(): string[];
}

export const useStoreLockFixture = (): StoreLockFixture => {
  const fixture: StoreLockFixture = {
    dir: "",
    store: "",
    lockFile: "",
    claimEntries: () =>
      fs.existsSync(`${fixture.lockFile}.claims`) ? fs.readdirSync(`${fixture.lockFile}.claims`) : [],
    reclaimFiles: () => fs.readdirSync(fixture.dir).filter((name) => name.endsWith(".reclaim")),
  };

  beforeEach(() => {
    fixture.dir = fs.mkdtempSync(path.join(os.tmpdir(), "store-lock-"));
    fixture.store = path.join(fixture.dir, "decks");
    fixture.lockFile = lockFileFor(fixture.store);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    (globalThis as typeof globalThis & { [ownClaimsKey]?: Set<string> })[ownClaimsKey]?.clear();
    fs.rmSync(fixture.dir, { recursive: true, force: true, maxRetries: 5 });
  });

  return fixture;
};
