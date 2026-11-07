import { spawn, spawnSync } from "child_process";
import { randomUUID } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { expectTypeOf, vi } from "vitest";
import { LOCK_CONTENT_GRACE_MS, lockFileFor, type SyncResult, withStoreLock } from "../utils/store-lock";

vi.mock("crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("crypto")>();
  return { ...actual, randomUUID: vi.fn(actual.randomUUID) };
});

const deadPid = (): number => {
  const child = spawnSync(process.execPath, ["-e", ""]);
  if (child.pid === undefined) throw new Error("could not spawn a child to obtain a dead pid");
  return child.pid;
};

const backdate = (file: string): void => {
  const old = new Date(Date.now() - LOCK_CONTENT_GRACE_MS * 2);
  fs.utimesSync(file, old, old);
};

const thrownMessage = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("expected the run to throw");
};

describe("withStoreLock", () => {
  let dir: string;
  let store: string;
  let lockFile: string;

  const claimEntries = (): string[] =>
    fs.existsSync(`${lockFile}.claims`) ? fs.readdirSync(`${lockFile}.claims`) : [];

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "store-lock-"));
    store = path.join(dir, "decks");
    lockFile = lockFileFor(store);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  });

  it("retries when the claims directory disappears during creation", () => {
    const claimsDir = `${lockFile}.claims`;
    const mkdir = fs.mkdirSync;
    let disappeared = false;
    const ran = vi.fn(() => "ran");
    vi.spyOn(fs, "mkdirSync").mockImplementation((target, options) => {
      if (String(target) === claimsDir && !disappeared) {
        disappeared = true;
        throw Object.assign(new Error("claims directory disappeared"), { code: "ENOENT" });
      }
      return mkdir(target, options);
    });

    expect(withStoreLock(store, ran)).toBe("ran");

    expect(ran).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(lockFile)).toBe(false);
    expect(fs.existsSync(claimsDir)).toBe(false);
  });

  it("throws and names the holding pid when the lock is already held", () => {
    const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"]);
    try {
      if (child.pid === undefined) throw new Error("could not spawn a live child");
      fs.writeFileSync(lockFile, String(child.pid));
      const heldMessage = `Store lock ${lockFile} is held by process ${child.pid}`;

      expect(() => withStoreLock(store, () => "ran")).toThrow(heldMessage);
      expect(claimEntries()).toEqual([]);
      expect(() => withStoreLock(store, () => "ran")).toThrow(heldMessage);
      expect(fs.readFileSync(lockFile, "utf8")).toBe(String(child.pid));
    } finally {
      child.kill();
    }
  });

  it("reclaims a lock naming this process when it holds no claim, and runs the callback", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const ran = vi.fn(() => "ran");
    fs.writeFileSync(lockFile, String(process.pid));

    expect(withStoreLock(store, ran)).toBe("ran");

    expect(warn).toHaveBeenCalledWith(
      `Store lock ${lockFile} holds pid ${process.pid}, which is this process and holds no claim; reclaiming it`
    );
    expect(ran).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(lockFile)).toBe(false);
  });

  it("rejects a callback that returns a promise and leaves no lock or claim", () => {
    const asyncCallback = vi.fn(async () => "ran") as unknown as () => string;

    let thrown: unknown;
    try {
      withStoreLock(store, asyncCallback);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(TypeError);
    expect((thrown as TypeError).message).toContain("synchronous");
    expect(asyncCallback).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(lockFile)).toBe(false);
    expect(claimEntries()).toEqual([]);
  });

  it("types a promise-returning callback out and a synchronous one in", () => {
    expectTypeOf<SyncResult<Promise<number>>>().toEqualTypeOf<never>();
    expectTypeOf<Parameters<typeof withStoreLock<number>>[1]>().toEqualTypeOf<() => number>();
    expectTypeOf<() => Promise<number>>().not.toExtend<Parameters<typeof withStoreLock<Promise<number>>>[1]>();
  });

  it("keeps a late rejection from a promise-returning callback from becoming unhandled", async () => {
    const unhandled = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const lateCallback = (async () => {
      await Promise.resolve();
      throw new Error("late failure");
    }) as unknown as () => string;
    process.on("unhandledRejection", unhandled);
    try {
      expect(() => withStoreLock(store, lateCallback)).toThrow(TypeError);
      await new Promise((resolve) => setImmediate(resolve));
    } finally {
      process.off("unhandledRejection", unhandled);
    }

    expect(unhandled).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("late failure"));
    expect(fs.existsSync(lockFile)).toBe(false);
  });

  it("releases the lock when the callback throws", () => {
    expect(() =>
      withStoreLock(store, () => {
        throw new Error("callback failed");
      })
    ).toThrow("callback failed");

    expect(fs.existsSync(lockFile)).toBe(false);
  });

  it("reclaims a lock whose pid belongs to no running process", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const gonePid = deadPid();
    fs.writeFileSync(lockFile, String(gonePid));

    expect(withStoreLock(store, () => "ran")).toBe("ran");

    expect(warn).toHaveBeenCalledWith(expect.stringContaining(String(gonePid)));
    expect(fs.existsSync(lockFile)).toBe(false);
  });

  it("reclaims a lock whose content is not a positive pid once it is older than the grace period", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    fs.writeFileSync(lockFile, "0");
    backdate(lockFile);

    expect(withStoreLock(store, () => "ran")).toBe("ran");

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("holds no pid"));
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining("pid 0"));
    expect(fs.existsSync(lockFile)).toBe(false);
  });

  it("treats an empty lock file with a fresh mtime as held", () => {
    const ran = vi.fn(() => "ran");
    fs.writeFileSync(lockFile, "");

    expect(thrownMessage(() => withStoreLock(store, ran))).toBe(
      `Store lock ${lockFile} is held by a process that has not written its pid yet; ` +
        "wait for that run to finish, or remove the lock file if the process is gone"
    );

    expect(ran).not.toHaveBeenCalled();
    expect(fs.readFileSync(lockFile, "utf8")).toBe("");
  });

  it("reclaims an empty lock file older than the grace period", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    fs.writeFileSync(lockFile, "");
    backdate(lockFile);

    expect(withStoreLock(store, () => "ran")).toBe("ran");

    expect(warn).toHaveBeenCalledWith(expect.stringContaining(lockFile));
    expect(fs.existsSync(lockFile)).toBe(false);
  });

  it("reclaims claim entries whose owner process has exited", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const deadClaim = path.join(`${lockFile}.claims`, "dead-owner");
    const gonePid = deadPid();
    fs.mkdirSync(path.dirname(deadClaim), { recursive: true });
    fs.writeFileSync(deadClaim, String(gonePid));

    expect(withStoreLock(store, () => "ran")).toBe("ran");

    expect(warn).toHaveBeenCalledWith(expect.stringContaining(String(gonePid)));
    expect(fs.existsSync(deadClaim)).toBe(false);
  });

  it("keeps a fresh claim without a pid held", () => {
    const claim = path.join(`${lockFile}.claims`, "incomplete");
    const ran = vi.fn(() => "ran");
    const stalePid = deadPid();
    fs.mkdirSync(path.dirname(claim), { recursive: true });
    fs.writeFileSync(claim, "");
    fs.writeFileSync(lockFile, String(stalePid));

    const message = thrownMessage(() => withStoreLock(store, ran));

    expect(message).toContain(claim);
    expect(message).toContain("has not written its pid yet");
    expect(message).not.toContain("another run is starting");
    expect(message).not.toContain("remove the lock file");
    expect(ran).not.toHaveBeenCalled();
    expect(fs.existsSync(claim)).toBe(true);
    expect(fs.readFileSync(lockFile, "utf8")).toBe(String(stalePid));
  });

  it("keeps a young live claim without a retry suffix while a lock file exists", () => {
    const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"]);
    const ran = vi.fn(() => "ran");
    try {
      if (child.pid === undefined) throw new Error("could not spawn a live child");
      const claim = path.join(`${lockFile}.claims`, `${child.pid}-00000000-0000-4000-8000-000000000000`);
      fs.mkdirSync(path.dirname(claim), { recursive: true });
      fs.writeFileSync(claim, String(child.pid));
      fs.writeFileSync(lockFile, String(child.pid));

      const message = thrownMessage(() => withStoreLock(store, ran));

      expect(message).toContain(claim);
      expect(message).toContain(`process ${child.pid}`);
      expect(message).not.toContain("another run is starting");
      expect(ran).not.toHaveBeenCalled();
      expect(fs.existsSync(claim)).toBe(true);
    } finally {
      child.kill();
    }
  });

  it("keeps the live claim refusal when the lock cannot be read", () => {
    const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"]);
    const ran = vi.fn(() => "ran");
    const read = fs.readFileSync;
    try {
      if (child.pid === undefined) throw new Error("could not spawn a live child");
      const claim = path.join(`${lockFile}.claims`, `${child.pid}-00000000-0000-4000-8000-000000000000`);
      fs.mkdirSync(path.dirname(claim), { recursive: true });
      fs.writeFileSync(claim, String(child.pid));
      fs.writeFileSync(lockFile, String(child.pid));
      vi.spyOn(fs, "readFileSync").mockImplementation((target, options) => {
        if (String(target) === lockFile) throw Object.assign(new Error("lock unreadable"), { code: "EACCES" });
        return read(target, options);
      });

      const message = thrownMessage(() => withStoreLock(store, ran));

      expect(message).toBe(
        `Store lock claim ${claim} is held by process ${child.pid}; wait for that run to finish, ` +
          "or remove that claim file if the process is gone"
      );
      expect(ran).not.toHaveBeenCalled();
      expect(fs.existsSync(claim)).toBe(true);
    } finally {
      child.kill();
    }
  });

  it("keeps the claim refusal when the lock cannot be read while a young claim has no pid", () => {
    const claim = path.join(`${lockFile}.claims`, "incomplete");
    const ran = vi.fn(() => "ran");
    const read = fs.readFileSync;
    fs.mkdirSync(path.dirname(claim), { recursive: true });
    fs.writeFileSync(claim, "");
    fs.writeFileSync(lockFile, String(deadPid()));
    vi.spyOn(fs, "readFileSync").mockImplementation((target, options) => {
      if (String(target) === lockFile) throw Object.assign(new Error("lock unreadable"), { code: "EACCES" });
      return read(target, options);
    });

    const message = thrownMessage(() => withStoreLock(store, ran));

    expect(message).toBe(
      `Store lock claim ${claim} has not written its pid yet; wait for that run to finish, ` +
        "or remove that claim file if the process is gone"
    );
    expect(ran).not.toHaveBeenCalled();
    expect(fs.existsSync(claim)).toBe(true);
  });

  it("names this process without a retry suffix when a nested call meets the outer claim", () => {
    const claimsDir = `${lockFile}.claims`;
    const nestedCallback = vi.fn(() => "nested");
    let ownClaim = "";
    let message = "";

    expect(
      withStoreLock(store, () => {
        ownClaim = path.join(claimsDir, claimEntries()[0]);
        message = thrownMessage(() => withStoreLock(store, nestedCallback));
        return "outer";
      })
    ).toBe("outer");

    expect(message).toBe(
      `Store lock claim ${ownClaim} is held by process ${process.pid}, which is this process: ` +
        "a store lock call is still running in it; the claim clears when that call ends"
    );
    expect(nestedCallback).not.toHaveBeenCalled();
    expect(claimEntries()).toEqual([]);
  });

  it("refuses a live claim that another copy of the module made in this process", async () => {
    vi.resetModules();
    const second = await import("../utils/store-lock");
    expect(second.withStoreLock).not.toBe(withStoreLock);
    const nestedCallback = vi.fn(() => "nested");
    let message = "";

    expect(
      withStoreLock(store, () => {
        message = thrownMessage(() => second.withStoreLock(store, nestedCallback));
        return "outer";
      })
    ).toBe("outer");

    expect(message).toContain(`process ${process.pid}`);
    expect(message).toContain("which is this process");
    expect(nestedCallback).not.toHaveBeenCalled();
    expect(claimEntries()).toEqual([]);
  });

  it("forgets a claim this process failed to remove, so its next call reclaims it with a warning and runs", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const claimsDir = `${lockFile}.claims`;
    const remove = fs.rmSync;
    const cleanupError = Object.assign(new Error("claim removal denied"), { code: "EACCES" });
    let failures = 0;
    vi.spyOn(fs, "rmSync").mockImplementation((target, options) => {
      if (String(target).startsWith(`${claimsDir}${path.sep}`) && failures === 0) {
        failures += 1;
        throw cleanupError;
      }
      remove(target, options);
    });

    let thrown: unknown;
    try {
      withStoreLock(store, () => "first");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(cleanupError);
    expect(claimEntries()).toHaveLength(1);
    const ran = vi.fn(() => "ran");

    expect(withStoreLock(store, ran)).toBe("ran");

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("names this process but was not created by it"));
    expect(ran).toHaveBeenCalledTimes(1);
    expect(claimEntries()).toEqual([]);
  });

  it("reclaims an aged empty claim named with this pid that this process did not create", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const claimsDir = `${lockFile}.claims`;
    const claim = path.join(claimsDir, `${process.pid}-00000000-0000-4000-8000-000000000000`);
    const ran = vi.fn(() => "ran");
    fs.mkdirSync(claimsDir, { recursive: true });
    fs.writeFileSync(claim, "");
    backdate(claim);
    fs.writeFileSync(lockFile, String(deadPid()));

    expect(withStoreLock(store, ran)).toBe("ran");

    expect(warn).toHaveBeenCalledWith(
      `Store lock claim ${claim} names this process but was not created by it; reclaiming it`
    );
    expect(ran).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(claim)).toBe(false);
    expect(fs.existsSync(lockFile)).toBe(false);
  });

  it("reclaims a claim named with this pid that this process did not create, and runs the callback", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const leftover = path.join(`${lockFile}.claims`, `${process.pid}-00000000-0000-4000-8000-000000000001`);
    const ran = vi.fn(() => "ran");
    fs.mkdirSync(path.dirname(leftover), { recursive: true });
    fs.writeFileSync(leftover, String(process.pid));

    expect(withStoreLock(store, ran)).toBe("ran");

    expect(warn).toHaveBeenCalledWith(
      `Store lock claim ${leftover} names this process but was not created by it; reclaiming it`
    );
    expect(ran).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(leftover)).toBe(false);
  });

  it("asks for a retry when the claims directory keeps disappearing", () => {
    const claimsDir = `${lockFile}.claims`;
    const ran = vi.fn(() => "ran");
    const mkdir = fs.mkdirSync;
    vi.spyOn(fs, "mkdirSync").mockImplementation((target, options) => {
      if (String(target) === claimsDir) {
        throw Object.assign(new Error("claims directory disappeared"), { code: "ENOENT" });
      }
      return mkdir(target, options);
    });

    const message = thrownMessage(() => withStoreLock(store, ran));

    expect(message).toContain(lockFile);
    expect(message).toContain("kept changing");
    expect(message).not.toContain("has not written its pid yet");
    expect(ran).not.toHaveBeenCalled();
  });

  it("asks for a retry when the lock keeps changing during acquisition", () => {
    fs.writeFileSync(lockFile, String(process.pid));
    const ran = vi.fn(() => "ran");
    const read = fs.readFileSync;
    vi.spyOn(fs, "readFileSync").mockImplementation((target, options) => {
      if (String(target) === lockFile) {
        throw Object.assign(new Error("lock file vanished"), { code: "ENOENT" });
      }
      return read(target, options);
    });

    const message = thrownMessage(() => withStoreLock(store, ran));

    expect(message).toContain(lockFile);
    expect(message).toContain("kept changing");
    expect(message).not.toContain("has not written its pid yet");
    expect(ran).not.toHaveBeenCalled();
    expect(claimEntries()).toEqual([]);
  });

  it("ignores a stray directory in the claims directory", () => {
    const claimsDir = `${lockFile}.claims`;
    const stray = path.join(claimsDir, "stray");
    const ran = vi.fn(() => "ran");
    fs.mkdirSync(stray, { recursive: true });

    expect(withStoreLock(store, ran)).toBe("ran");

    expect(ran).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(lockFile)).toBe(false);
    expect(fs.existsSync(stray)).toBe(true);
  });

  it("fails closed when it cannot inspect claim entries", () => {
    const claimsDir = `${lockFile}.claims`;
    const ran = vi.fn(() => "ran");
    const stalePid = deadPid();
    fs.mkdirSync(claimsDir, { recursive: true });
    fs.writeFileSync(lockFile, String(stalePid));
    vi.spyOn(fs, "readdirSync").mockImplementation(() => {
      throw Object.assign(new Error("claim directory unreadable"), { code: "EACCES" });
    });

    expect(() => withStoreLock(store, ran)).toThrow("claim directory unreadable");

    expect(ran).not.toHaveBeenCalled();
    expect(fs.readFileSync(lockFile, "utf8")).toBe(String(stalePid));
  });

  it("fails closed when a claim filename and owner pid conflict", () => {
    const claimsDir = `${lockFile}.claims`;
    const stalePid = deadPid();
    const claim = path.join(claimsDir, `${stalePid}-00000000-0000-4000-8000-000000000000`);
    const staleLockPid = deadPid();
    const ran = vi.fn(() => "ran");
    fs.mkdirSync(claimsDir, { recursive: true });
    fs.writeFileSync(claim, String(process.pid));
    fs.writeFileSync(lockFile, String(staleLockPid));

    expect(() => withStoreLock(store, ran)).toThrow("conflicting owner pids");

    expect(ran).not.toHaveBeenCalled();
    expect(fs.readFileSync(lockFile, "utf8")).toBe(String(staleLockPid));
  });

  it("retries if its claim disappears during stale claim cleanup", () => {
    const claimsDir = `${lockFile}.claims`;
    const staleClaim = path.join(claimsDir, "dead-owner");
    const remove = fs.rmSync;
    let claimDisappeared = 0;
    fs.mkdirSync(claimsDir, { recursive: true });
    fs.writeFileSync(staleClaim, String(deadPid()));
    fs.writeFileSync(lockFile, String(deadPid()));
    vi.spyOn(fs, "rmSync").mockImplementation((target, options) => {
      remove(target, options);
      if (String(target) === staleClaim && claimDisappeared === 0) {
        claimDisappeared += 1;
        const ownClaim = fs
          .readdirSync(claimsDir)
          .map((name) => path.join(claimsDir, name))
          .find((file) => fs.readFileSync(file, "utf8") === String(process.pid));
        if (ownClaim) remove(ownClaim, { force: true });
      }
    });
    const ranWithClaim = vi.fn(() => {
      const ownClaims = fs
        .readdirSync(claimsDir)
        .map((name) => path.join(claimsDir, name))
        .filter((file) => fs.readFileSync(file, "utf8") === String(process.pid));
      expect(ownClaims).toHaveLength(1);
      return "ran";
    });

    expect(withStoreLock(store, ranWithClaim)).toBe("ran");

    expect(claimDisappeared).toBe(1);
    expect(ranWithClaim).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(lockFile)).toBe(false);
    expect(claimEntries()).toEqual([]);
  });

  it("removes a stale lock in place without renaming it", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const rename = vi.spyOn(fs, "renameSync");
    const ran = vi.fn(() => "ran");
    fs.writeFileSync(lockFile, String(deadPid()));

    expect(withStoreLock(store, ran)).toBe("ran");

    expect(rename).not.toHaveBeenCalled();
    expect(ran).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(lockFile)).toBe(false);
  });

  it("keeps the lock held when it changes to a live pid before the re-read, which the two reads prove", () => {
    const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"]);
    const read = fs.readFileSync;
    const ran = vi.fn(() => "ran");
    let reads = 0;
    try {
      if (child.pid === undefined) throw new Error("could not spawn a live child");
      fs.writeFileSync(lockFile, String(deadPid()));
      vi.spyOn(fs, "readFileSync").mockImplementation((target, options) => {
        if (String(target) === lockFile) {
          reads += 1;
          if (reads === 2) fs.writeFileSync(lockFile, String(child.pid));
        }
        return read(target, options);
      });

      expect(() => withStoreLock(store, ran)).toThrow(`Store lock ${lockFile} is held by process ${child.pid}`);

      expect(reads).toBe(2);
      expect(ran).not.toHaveBeenCalled();
      expect(fs.readFileSync(lockFile, "utf8")).toBe(String(child.pid));
    } finally {
      child.kill();
    }
  });

  it("refuses a same-version writer that enters during the reclaim window and never opens the lock", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const read = fs.readFileSync;
    const open = fs.openSync;
    const stale = String(deadPid());
    const ran = vi.fn(() => "ran");
    const nestedCallback = vi.fn(() => "nested");
    let lockReads = 0;
    let inWindow = false;
    let windowOpens = 0;
    let nestedMessage = "";
    fs.writeFileSync(lockFile, stale);
    vi.spyOn(fs, "openSync").mockImplementation((...args) => {
      if (inWindow && String(args[0]) === lockFile) windowOpens += 1;
      return open(...args);
    });
    vi.spyOn(fs, "readFileSync").mockImplementation((target, options) => {
      if (String(target) === lockFile) {
        lockReads += 1;
        if (lockReads === 2) {
          inWindow = true;
          nestedMessage = thrownMessage(() => withStoreLock(store, nestedCallback));
          inWindow = false;
        }
      }
      return read(target, options);
    });

    expect(withStoreLock(store, ran)).toBe("ran");

    expect(nestedMessage).toContain(`${lockFile}.claims${path.sep}${process.pid}-`);
    expect(nestedMessage).toContain("which is this process");
    expect(windowOpens).toBe(0);
    expect(nestedCallback).not.toHaveBeenCalled();
    expect(ran).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(lockFile)).toBe(false);
  });

  it("reclaims a lock that changes to a dead pid before the re-read", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const read = fs.readFileSync;
    const ran = vi.fn(() => "ran");
    const inspected = String(deadPid());
    const changed = String(deadPid());
    let reads = 0;
    fs.writeFileSync(lockFile, inspected);
    vi.spyOn(fs, "readFileSync").mockImplementation((target, options) => {
      if (String(target) === lockFile) {
        reads += 1;
        if (reads === 2) fs.writeFileSync(lockFile, changed);
      }
      return read(target, options);
    });

    expect(withStoreLock(store, ran)).toBe("ran");

    expect(ran).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(changed));
    expect(fs.existsSync(lockFile)).toBe(false);
  });

  it("refuses a contender while another live process holds a claim", () => {
    const claimsDir = `${lockFile}.claims`;
    const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"]);
    const ran = vi.fn(() => "ran");
    try {
      if (child.pid === undefined) throw new Error("could not spawn a live child");
      const claim = path.join(claimsDir, `${child.pid}-00000000-0000-4000-8000-000000000000`);
      fs.mkdirSync(claimsDir, { recursive: true });
      fs.writeFileSync(claim, String(child.pid));

      const message = thrownMessage(() => withStoreLock(store, ran));

      expect(message).toContain(claim);
      expect(message).toContain(`process ${child.pid}`);
      expect(message).toContain("another run is starting, so retry shortly");
      expect(message).not.toContain("remove the lock file");
      expect(ran).not.toHaveBeenCalled();
      expect(fs.existsSync(claim)).toBe(true);
      expect(fs.existsSync(lockFile)).toBe(false);
    } finally {
      child.kill();
    }
  });

  it("does not say another run is starting when the live claim is past the grace period", () => {
    const claimsDir = `${lockFile}.claims`;
    const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"]);
    const ran = vi.fn(() => "ran");
    try {
      if (child.pid === undefined) throw new Error("could not spawn a live child");
      const claim = path.join(claimsDir, `${child.pid}-00000000-0000-4000-8000-000000000000`);
      fs.mkdirSync(claimsDir, { recursive: true });
      fs.writeFileSync(claim, String(child.pid));
      backdate(claim);

      const message = thrownMessage(() => withStoreLock(store, ran));

      expect(message).toContain(claim);
      expect(message).not.toContain("another run is starting");
      expect(ran).not.toHaveBeenCalled();
    } finally {
      child.kill();
    }
  });

  it("retries the exclusive create when the lock file is gone by the time it reads it", () => {
    const write = fs.writeFileSync;
    let first = true;
    const create = vi.spyOn(fs, "writeFileSync").mockImplementation((file, data, options) => {
      if (String(file) === lockFile && first) {
        first = false;
        throw Object.assign(new Error("lock file exists"), { code: "EEXIST" });
      }
      write(file, data, options);
    });

    expect(withStoreLock(store, () => "ran")).toBe("ran");

    expect(create).toHaveBeenCalled();
    expect(fs.existsSync(lockFile)).toBe(false);
  });

  it("preserves a live-owner refusal when Windows rejects nonempty claim cleanup", () => {
    const claimsDir = `${lockFile}.claims`;
    const rmdir = fs.rmdirSync;
    const nestedCallback = vi.fn(() => "nested");
    vi.spyOn(fs, "rmdirSync").mockImplementation((target) => {
      if (String(target) === claimsDir && fs.readdirSync(claimsDir).length > 0) {
        throw Object.assign(new Error("directory not empty"), { code: "EPERM" });
      }
      return rmdir(target);
    });

    expect(
      withStoreLock(store, () => {
        expect(() => withStoreLock(store, nestedCallback)).toThrow(
          `Store lock claim ${claimsDir}${path.sep}${process.pid}-`
        );
        return "outer";
      })
    ).toBe("outer");

    expect(nestedCallback).not.toHaveBeenCalled();
    expect(fs.existsSync(claimsDir)).toBe(false);
  });

  it("retries claim directory removal after a peer exits during EPERM cleanup", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const claimsDir = `${lockFile}.claims`;
    const peer = path.join(claimsDir, `${process.pid + 1}-00000000-0000-4000-8000-000000000000`);
    const remove = fs.rmSync;
    const rmdir = fs.rmdirSync;
    let peerCreated = 0;
    vi.spyOn(fs, "rmSync").mockImplementation((target, options) => {
      remove(target, options);
      if (String(target).startsWith(`${claimsDir}${path.sep}`) && peerCreated === 0) {
        peerCreated += 1;
        fs.writeFileSync(peer, String(process.pid + 1));
      }
    });
    vi.spyOn(fs, "rmdirSync").mockImplementation((target) => {
      if (String(target) === claimsDir && fs.readdirSync(claimsDir).length > 0) {
        remove(peer, { force: true });
        throw Object.assign(new Error("directory not empty"), { code: "EPERM" });
      }
      return rmdir(target);
    });

    expect(withStoreLock(store, () => "ran")).toBe("ran");

    expect(peerCreated).toBe(1);
    expect(warn).not.toHaveBeenCalled();
    expect(fs.existsSync(claimsDir)).toBe(false);
  });

  it("warns and keeps the result when claim directory cleanup sees a persistent EPERM on an empty directory", () => {
    const claimsDir = `${lockFile}.claims`;
    const rmdir = fs.rmdirSync;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const ran = vi.fn(() => "ran");
    vi.spyOn(fs, "rmdirSync").mockImplementation((target) => {
      if (String(target) === claimsDir) {
        throw Object.assign(new Error("claim directory cleanup denied"), { code: "EPERM" });
      }
      return rmdir(target);
    });

    expect(withStoreLock(store, ran)).toBe("ran");

    expect(ran).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(claimsDir));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("EPERM"));
    expect(fs.existsSync(lockFile)).toBe(false);
    expect(fs.readdirSync(claimsDir)).toEqual([]);
  });

  it("surfaces a claim file removal failure without warning about the claims directory", () => {
    const claimsDir = `${lockFile}.claims`;
    const remove = fs.rmSync;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const cleanupError = Object.assign(new Error("claim removal denied"), { code: "EACCES" });
    vi.spyOn(fs, "rmSync").mockImplementation((target, options) => {
      if (String(target).startsWith(`${claimsDir}${path.sep}`)) throw cleanupError;
      remove(target, options);
    });

    let thrown: unknown;
    try {
      withStoreLock(store, () => "ran");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(cleanupError);
    expect(warn).not.toHaveBeenCalled();
  });

  it("removes a claim whose pid write fails and leaves the lock usable", () => {
    const claimsDir = `${lockFile}.claims`;
    const open = fs.openSync;
    const writeFile = fs.writeFileSync;
    const claimDescriptors = new Set<number>();
    let failedWrites = 0;
    vi.spyOn(fs, "openSync").mockImplementation((...args) => {
      const fd = open(...args);
      if (String(args[0]).startsWith(`${claimsDir}${path.sep}`)) claimDescriptors.add(fd);
      return fd;
    });
    vi.spyOn(fs, "writeFileSync").mockImplementation((file, data, options) => {
      if (typeof file === "number" && claimDescriptors.has(file) && failedWrites === 0) {
        failedWrites += 1;
        throw Object.assign(new Error("no space left on device"), { code: "ENOSPC" });
      }
      return writeFile(file, data, options);
    });

    let thrown: unknown;
    try {
      withStoreLock(store, () => "ran");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({ code: "ENOSPC" });
    expect(failedWrites).toBe(1);
    expect(claimEntries()).toEqual([]);
    expect(withStoreLock(store, () => "ran")).toBe("ran");
  });

  it("removes the lock file when its pid write fails and lets the next run take it", () => {
    const open = fs.openSync;
    const writeFile = fs.writeFileSync;
    let lockDescriptor: number | undefined;
    let failedWrites = 0;
    const ran = vi.fn(() => "ran");
    vi.spyOn(fs, "openSync").mockImplementation((...args) => {
      const fd = open(...args);
      if (String(args[0]) === lockFile) lockDescriptor = fd;
      return fd;
    });
    vi.spyOn(fs, "writeFileSync").mockImplementation((file, data, options) => {
      if (file === lockDescriptor && failedWrites === 0) {
        failedWrites += 1;
        throw Object.assign(new Error("no space left on device"), { code: "ENOSPC" });
      }
      return writeFile(file, data, options);
    });

    expect(() => withStoreLock(store, ran)).toThrow("no space left on device");

    expect(failedWrites).toBe(1);
    expect(fs.existsSync(lockFile)).toBe(false);
    expect(withStoreLock(store, ran)).toBe("ran");
    expect(ran).toHaveBeenCalledTimes(1);
  });

  it("keeps the write error when removing the claim also fails", () => {
    const claimsDir = `${lockFile}.claims`;
    const open = fs.openSync;
    const writeFile = fs.writeFileSync;
    const remove = fs.rmSync;
    const claimDescriptors = new Set<number>();
    const writeError = Object.assign(new Error("no space left on device"), { code: "ENOSPC" });
    const cleanupError = Object.assign(new Error("claim removal denied"), { code: "EACCES" });
    vi.spyOn(fs, "openSync").mockImplementation((...args) => {
      const fd = open(...args);
      if (String(args[0]).startsWith(`${claimsDir}${path.sep}`)) claimDescriptors.add(fd);
      return fd;
    });
    vi.spyOn(fs, "writeFileSync").mockImplementation((file, data, options) => {
      if (typeof file === "number" && claimDescriptors.has(file)) throw writeError;
      return writeFile(file, data, options);
    });
    vi.spyOn(fs, "rmSync").mockImplementation((target, options) => {
      if (String(target).startsWith(`${claimsDir}${path.sep}`)) throw cleanupError;
      remove(target, options);
    });

    let thrown: unknown;
    try {
      withStoreLock(store, () => "ran");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AggregateError);
    const aggregate = thrown as AggregateError;
    expect(aggregate.message).toContain("no space left on device");
    expect(aggregate.message).toContain("store lock cleanup also failed");
    expect(aggregate.errors).toEqual([writeError, cleanupError]);
  });

  it("flattens a lock write failure with lock and claim cleanup failures into one aggregate", () => {
    const claimsDir = `${lockFile}.claims`;
    const open = fs.openSync;
    const writeFile = fs.writeFileSync;
    const remove = fs.rmSync;
    let lockDescriptor: number | undefined;
    const writeError = Object.assign(new Error("no space left on device"), { code: "ENOSPC" });
    const lockCleanupError = Object.assign(new Error("lock removal denied"), { code: "EACCES" });
    const claimCleanupError = Object.assign(new Error("claim removal denied"), { code: "EACCES" });
    vi.spyOn(fs, "openSync").mockImplementation((...args) => {
      const fd = open(...args);
      if (String(args[0]) === lockFile) lockDescriptor = fd;
      return fd;
    });
    vi.spyOn(fs, "writeFileSync").mockImplementation((file, data, options) => {
      if (file === lockDescriptor) throw writeError;
      return writeFile(file, data, options);
    });
    vi.spyOn(fs, "rmSync").mockImplementation((target, options) => {
      if (String(target) === lockFile) throw lockCleanupError;
      if (String(target).startsWith(`${claimsDir}${path.sep}`)) throw claimCleanupError;
      remove(target, options);
    });

    let thrown: unknown;
    try {
      withStoreLock(store, () => "ran");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AggregateError);
    const aggregate = thrown as AggregateError;
    expect(aggregate.message).toBe(
      "no space left on device; store lock cleanup also failed: lock removal denied; claim removal denied"
    );
    expect(aggregate.errors).toHaveLength(3);
    expect(aggregate.errors[0]).toBe(writeError);
    expect(aggregate.errors[1]).toBe(lockCleanupError);
    expect(aggregate.errors[2]).toBe(claimCleanupError);
  });

  it("names every cleanup failure once when a write and close aggregate meets a lock cleanup failure", () => {
    const open = fs.openSync;
    const writeFile = fs.writeFileSync;
    const close = fs.closeSync;
    const remove = fs.rmSync;
    let lockDescriptor: number | undefined;
    const writeError = Object.assign(new Error("no space left on device"), { code: "ENOSPC" });
    const closeError = Object.assign(new Error("close failed"), { code: "EIO" });
    const cleanupError = Object.assign(new Error("lock removal denied"), { code: "EACCES" });
    vi.spyOn(fs, "openSync").mockImplementation((...args) => {
      const fd = open(...args);
      if (String(args[0]) === lockFile) lockDescriptor = fd;
      return fd;
    });
    vi.spyOn(fs, "writeFileSync").mockImplementation((file, data, options) => {
      if (file === lockDescriptor) throw writeError;
      return writeFile(file, data, options);
    });
    vi.spyOn(fs, "closeSync").mockImplementation((fd) => {
      close(fd);
      if (fd === lockDescriptor) throw closeError;
    });
    vi.spyOn(fs, "rmSync").mockImplementation((target, options) => {
      if (String(target) === lockFile) throw cleanupError;
      remove(target, options);
    });

    let thrown: unknown;
    try {
      withStoreLock(store, () => "ran");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AggregateError);
    const aggregate = thrown as AggregateError;
    expect(aggregate.message).toBe(
      "no space left on device; closing the store lock file also failed; store lock cleanup also failed: lock removal denied"
    );
    expect(aggregate.errors).toHaveLength(3);
    expect(aggregate.errors).toEqual([writeError, closeError, cleanupError]);
  });

  it("keeps both the pid write error and the close error when the lock write and close both fail", () => {
    const open = fs.openSync;
    const writeFile = fs.writeFileSync;
    const close = fs.closeSync;
    let lockDescriptor: number | undefined;
    const writeError = Object.assign(new Error("no space left on device"), { code: "ENOSPC" });
    const closeError = Object.assign(new Error("close failed"), { code: "EIO" });
    vi.spyOn(fs, "openSync").mockImplementation((...args) => {
      const fd = open(...args);
      if (String(args[0]) === lockFile) lockDescriptor = fd;
      return fd;
    });
    vi.spyOn(fs, "writeFileSync").mockImplementation((file, data, options) => {
      if (file === lockDescriptor) throw writeError;
      return writeFile(file, data, options);
    });
    vi.spyOn(fs, "closeSync").mockImplementation((fd) => {
      close(fd);
      if (fd === lockDescriptor) throw closeError;
    });

    let thrown: unknown;
    try {
      withStoreLock(store, () => "ran");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AggregateError);
    const aggregate = thrown as AggregateError;
    expect(aggregate.message).toBe("no space left on device; closing the store lock file also failed");
    expect(aggregate.errors).toHaveLength(2);
    expect(aggregate.errors[0]).toBe(writeError);
    expect(aggregate.errors[1]).toBe(closeError);
    expect(fs.existsSync(lockFile)).toBe(false);
  });

  it("removes its claim once when the read-back mismatch is cleaned up", () => {
    const claimsDir = `${lockFile}.claims`;
    const read = fs.readFileSync;
    const remove = fs.rmSync;
    const ran = vi.fn(() => "ran");
    const misreads: string[] = [];
    const removals = new Map<string, number>();
    vi.spyOn(fs, "readFileSync").mockImplementation((target, options) => {
      if (misreads.length === 0 && String(target).startsWith(`${claimsDir}${path.sep}`)) {
        misreads.push(String(target));
        return "0";
      }
      return read(target, options);
    });
    vi.spyOn(fs, "rmSync").mockImplementation((target, options) => {
      removals.set(String(target), (removals.get(String(target)) ?? 0) + 1);
      remove(target, options);
    });

    expect(withStoreLock(store, ran)).toBe("ran");

    expect(misreads).toHaveLength(1);
    expect(removals.get(misreads[0])).toBe(1);
    expect(ran).toHaveBeenCalledTimes(1);
    expect(claimEntries()).toEqual([]);
  });

  it("keeps the claim refusal when removing the claim also fails", () => {
    const claimsDir = `${lockFile}.claims`;
    const staleClaim = path.join(claimsDir, `${deadPid()}-00000000-0000-4000-8000-000000000000`);
    const remove = fs.rmSync;
    const cleanupError = Object.assign(new Error("claim removal denied"), { code: "EACCES" });
    fs.mkdirSync(claimsDir, { recursive: true });
    fs.writeFileSync(staleClaim, String(process.pid));
    fs.writeFileSync(lockFile, String(deadPid()));
    vi.spyOn(fs, "rmSync").mockImplementation((target, options) => {
      if (String(target).startsWith(`${claimsDir}${path.sep}`) && String(target) !== staleClaim) throw cleanupError;
      remove(target, options);
    });
    const ran = vi.fn(() => "ran");

    let thrown: unknown;
    try {
      withStoreLock(store, ran);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AggregateError);
    const aggregate = thrown as AggregateError;
    expect(aggregate.message).toContain("conflicting owner pids");
    expect(aggregate.errors).toHaveLength(2);
    expect(aggregate.errors[1]).toBe(cleanupError);
    expect(ran).not.toHaveBeenCalled();
  });

  it("keeps the held refusal when removing the claim also fails", () => {
    const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"]);
    const claimsDir = `${lockFile}.claims`;
    const remove = fs.rmSync;
    const cleanupError = Object.assign(new Error("claim removal denied"), { code: "EACCES" });
    const ran = vi.fn(() => "ran");
    try {
      if (child.pid === undefined) throw new Error("could not spawn a live child");
      fs.writeFileSync(lockFile, String(child.pid));
      vi.spyOn(fs, "rmSync").mockImplementation((target, options) => {
        if (String(target).startsWith(`${claimsDir}${path.sep}`)) throw cleanupError;
        remove(target, options);
      });

      let thrown: unknown;
      try {
        withStoreLock(store, ran);
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(AggregateError);
      const aggregate = thrown as AggregateError;
      expect(aggregate.message).toContain(`Store lock ${lockFile} is held by process ${child.pid}`);
      expect(aggregate.errors).toHaveLength(2);
      expect(aggregate.errors[1]).toBe(cleanupError);
      expect(ran).not.toHaveBeenCalled();
    } finally {
      child.kill();
    }
  });

  it("surfaces a failed removal of a claim that reads back another pid, with the mismatch as the original", () => {
    const claimsDir = `${lockFile}.claims`;
    const read = fs.readFileSync;
    const remove = fs.rmSync;
    const cleanupError = Object.assign(new Error("claim removal denied"), { code: "EACCES" });
    const misreads: string[] = [];
    vi.spyOn(fs, "readFileSync").mockImplementation((target, options) => {
      if (misreads.length === 0 && String(target).startsWith(`${claimsDir}${path.sep}`)) {
        misreads.push(String(target));
        return "0";
      }
      return read(target, options);
    });
    vi.spyOn(fs, "rmSync").mockImplementation((target, options) => {
      if (String(target).startsWith(`${claimsDir}${path.sep}`)) throw cleanupError;
      remove(target, options);
    });
    const ran = vi.fn(() => "ran");

    let thrown: unknown;
    try {
      withStoreLock(store, ran);
    } catch (error) {
      thrown = error;
    }

    expect(misreads).toHaveLength(1);
    expect(thrown).toBeInstanceOf(AggregateError);
    const aggregate = thrown as AggregateError;
    expect(aggregate.errors).toHaveLength(2);
    expect(aggregate.errors[0]).toBeInstanceOf(Error);
    expect(aggregate.errors[1]).toBe(cleanupError);
    expect(aggregate.message).toBe(
      `Store lock claim ${misreads[0]} did not read back this process's pid; store lock cleanup also failed: claim removal denied`
    );
    expect(ran).not.toHaveBeenCalled();
  });

  it("flattens a callback AggregateError with the claim cleanup failure into one aggregate", () => {
    const claimsDir = `${lockFile}.claims`;
    const remove = fs.rmSync;
    const first = new Error("purge refused");
    const second = new Error("store unreadable");
    const callbackError = new AggregateError([first, second], "purge failed");
    const cleanupError = Object.assign(new Error("claim removal denied"), { code: "EACCES" });
    vi.spyOn(fs, "rmSync").mockImplementation((target, options) => {
      if (String(target).startsWith(`${claimsDir}${path.sep}`)) throw cleanupError;
      remove(target, options);
    });

    let thrown: unknown;
    try {
      withStoreLock(store, () => {
        throw callbackError;
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AggregateError);
    const aggregate = thrown as AggregateError;
    expect(aggregate.errors).toHaveLength(3);
    expect(aggregate.errors[0]).toBe(first);
    expect(aggregate.errors[1]).toBe(second);
    expect(aggregate.errors[2]).toBe(cleanupError);
    expect(aggregate.message).toBe("purge failed; store lock cleanup also failed: claim removal denied");
  });

  it("names both cleanup failures in the message when a callback error meets release and claim failures", () => {
    const claimsDir = `${lockFile}.claims`;
    const remove = fs.rmSync;
    const callbackError = new Error("purge refused");
    const releaseError = Object.assign(new Error("lock removal denied"), { code: "EACCES" });
    const claimError = Object.assign(new Error("claim removal denied"), { code: "EACCES" });
    vi.spyOn(fs, "rmSync").mockImplementation((target, options) => {
      if (String(target) === lockFile) throw releaseError;
      if (String(target).startsWith(`${claimsDir}${path.sep}`)) throw claimError;
      remove(target, options);
    });

    let thrown: unknown;
    try {
      withStoreLock(store, () => {
        throw callbackError;
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AggregateError);
    const aggregate = thrown as AggregateError;
    expect(aggregate.errors).toHaveLength(3);
    expect(aggregate.errors[0]).toBe(callbackError);
    expect(aggregate.errors[1]).toBe(releaseError);
    expect(aggregate.errors[2]).toBe(claimError);
    expect(aggregate.message).toBe(
      "purge refused; store lock cleanup also failed: lock removal denied; claim removal denied"
    );
  });

  it("keeps the callback error when claim cleanup also fails", () => {
    const claimsDir = `${lockFile}.claims`;
    const remove = fs.rmSync;
    const callbackError = new Error("purge refused");
    const cleanupError = Object.assign(new Error("claim removal denied"), { code: "EACCES" });
    vi.spyOn(fs, "rmSync").mockImplementation((target, options) => {
      if (String(target).startsWith(`${claimsDir}${path.sep}`)) throw cleanupError;
      remove(target, options);
    });

    let thrown: unknown;
    try {
      withStoreLock(store, () => {
        throw callbackError;
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AggregateError);
    const aggregate = thrown as AggregateError;
    expect(aggregate.message).toMatch(/^purge refused/);
    expect(aggregate.message).toContain("lock cleanup also failed");
    expect(aggregate.errors).toHaveLength(2);
    expect(aggregate.errors[0]).toBe(callbackError);
    expect(aggregate.errors[1]).toBe(cleanupError);
  });

  it("surfaces a cleanup error when the callback succeeds", () => {
    const claimsDir = `${lockFile}.claims`;
    const remove = fs.rmSync;
    const cleanupError = Object.assign(new Error("claim removal denied"), { code: "EACCES" });
    vi.spyOn(fs, "rmSync").mockImplementation((target, options) => {
      if (String(target).startsWith(`${claimsDir}${path.sep}`)) throw cleanupError;
      remove(target, options);
    });

    let thrown: unknown;
    try {
      withStoreLock(store, () => "ran");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(cleanupError);
  });

  it("rethrows the callback error unchanged when cleanup succeeds", () => {
    const callbackError = new Error("purge refused");

    let thrown: unknown;
    try {
      withStoreLock(store, () => {
        throw callbackError;
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(callbackError);
  });

  it("aggregates release and claim cleanup errors when the callback succeeds", () => {
    const claimsDir = `${lockFile}.claims`;
    const remove = fs.rmSync;
    const releaseError = Object.assign(new Error("lock removal denied"), { code: "EACCES" });
    const claimError = Object.assign(new Error("claim removal denied"), { code: "EACCES" });
    vi.spyOn(fs, "rmSync").mockImplementation((target, options) => {
      if (String(target) === lockFile) throw releaseError;
      if (String(target).startsWith(`${claimsDir}${path.sep}`)) throw claimError;
      remove(target, options);
    });

    let thrown: unknown;
    try {
      withStoreLock(store, () => {
        fs.writeFileSync(lockFile, String(process.pid));
        return "ran";
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AggregateError);
    expect((thrown as AggregateError).errors).toHaveLength(2);
    expect((thrown as AggregateError).errors[0]).toBe(releaseError);
    expect((thrown as AggregateError).errors[1]).toBe(claimError);
    expect((thrown as AggregateError).message).toBe(
      `store lock cleanup failed: ${releaseError.message}; ${claimError.message}`
    );
  });

  it("leaves another process's lock file in place when the file no longer holds our pid", () => {
    const otherPid = String(process.pid + 1);

    expect(
      withStoreLock(store, () => {
        fs.writeFileSync(lockFile, otherPid);
        return "ran";
      })
    ).toBe("ran");

    expect(fs.readFileSync(lockFile, "utf8")).toBe(otherPid);
  });

  it("keeps the lock held when process.kill reports EPERM for the holder", () => {
    const holder = deadPid();
    const kill = process.kill;
    const ran = vi.fn(() => "ran");
    fs.writeFileSync(lockFile, String(holder));
    vi.spyOn(process, "kill").mockImplementation((pid, signal) => {
      if (pid === holder) throw Object.assign(new Error("operation not permitted"), { code: "EPERM" });
      return kill.call(process, pid, signal);
    });

    expect(() => withStoreLock(store, ran)).toThrow(`Store lock ${lockFile} is held by process ${holder}`);

    expect(ran).not.toHaveBeenCalled();
    expect(fs.readFileSync(lockFile, "utf8")).toBe(String(holder));
  });

  it("surfaces a lock create error that is not EEXIST", () => {
    const open = fs.openSync;
    const ran = vi.fn(() => "ran");
    vi.spyOn(fs, "openSync").mockImplementation((...args) => {
      if (String(args[0]) === lockFile) throw Object.assign(new Error("lock create denied"), { code: "EACCES" });
      return open(...args);
    });

    expect(() => withStoreLock(store, ran)).toThrow("lock create denied");

    expect(ran).not.toHaveBeenCalled();
  });

  it("surfaces a claim open error that is neither ENOENT nor EEXIST", () => {
    const claimsDir = `${lockFile}.claims`;
    const open = fs.openSync;
    const ran = vi.fn(() => "ran");
    vi.spyOn(fs, "openSync").mockImplementation((...args) => {
      if (String(args[0]).startsWith(`${claimsDir}${path.sep}`)) {
        throw Object.assign(new Error("claim create denied"), { code: "EACCES" });
      }
      return open(...args);
    });

    expect(() => withStoreLock(store, ran)).toThrow("claim create denied");

    expect(ran).not.toHaveBeenCalled();
  });

  it("retries the claim when its open reports ENOENT", () => {
    const claimsDir = `${lockFile}.claims`;
    const open = fs.openSync;
    const ran = vi.fn(() => "ran");
    let vanished = 0;
    vi.spyOn(fs, "openSync").mockImplementation((...args) => {
      if (String(args[0]).startsWith(`${claimsDir}${path.sep}`) && vanished === 0) {
        vanished += 1;
        throw Object.assign(new Error("claims directory vanished"), { code: "ENOENT" });
      }
      return open(...args);
    });

    expect(withStoreLock(store, ran)).toBe("ran");

    expect(vanished).toBe(1);
    expect(ran).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(lockFile)).toBe(false);
  });

  it("retries the claim open instead of overwriting a file already at the claim path", () => {
    const fixed = "00000000-0000-4000-8000-0000000000aa";
    const claim = path.join(`${lockFile}.claims`, `${process.pid}-${fixed}`);
    const ran = vi.fn(() => "ran");
    fs.mkdirSync(path.dirname(claim), { recursive: true });
    fs.writeFileSync(claim, "unrelated");
    let message = "";
    vi.mocked(randomUUID).mockReturnValue(fixed);
    try {
      message = thrownMessage(() => withStoreLock(store, ran));
    } finally {
      vi.mocked(randomUUID).mockRestore();
    }

    expect(message).toContain(lockFile);
    expect(message).toContain("kept changing");
    expect(ran).not.toHaveBeenCalled();
    expect(fs.readFileSync(claim, "utf8")).toBe("unrelated");
  });

  it("retries when an empty lock file vanishes before its age is read", () => {
    const stat = fs.statSync;
    const ran = vi.fn(() => "ran");
    let vanished = 0;
    fs.writeFileSync(lockFile, "");
    vi.spyOn(fs, "statSync").mockImplementation((target, options) => {
      if (String(target) === lockFile && vanished === 0) {
        vanished += 1;
        fs.rmSync(lockFile, { force: true });
        throw Object.assign(new Error("lock file vanished"), { code: "ENOENT" });
      }
      return stat(target, options);
    });

    expect(withStoreLock(store, ran)).toBe("ran");

    expect(vanished).toBe(1);
    expect(ran).toHaveBeenCalledTimes(1);
  });

  it("retries when a stale lock vanishes before it is removed", () => {
    const read = fs.readFileSync;
    const ran = vi.fn(() => "ran");
    const stale = String(deadPid());
    let staleReads = 0;
    let vanished = 0;
    fs.writeFileSync(lockFile, stale);
    vi.spyOn(fs, "readFileSync").mockImplementation((target, options) => {
      if (String(target) !== lockFile) return read(target, options);
      const contents = read(target, options);
      if (contents !== stale) return contents;
      staleReads += 1;
      if (staleReads !== 2) return contents;
      vanished += 1;
      fs.rmSync(lockFile, { force: true });
      return read(target, options);
    });

    expect(withStoreLock(store, ran)).toBe("ran");

    expect(vanished).toBe(1);
    expect(ran).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(lockFile)).toBe(false);
  });

  it("skips a claim that vanishes during the scan", () => {
    const claimsDir = `${lockFile}.claims`;
    const vanishing = path.join(claimsDir, `${process.pid}-00000000-0000-4000-8000-000000000000`);
    const read = fs.readFileSync;
    const ran = vi.fn(() => "ran");
    let vanished = 0;
    fs.mkdirSync(claimsDir, { recursive: true });
    fs.writeFileSync(vanishing, String(process.pid));
    fs.writeFileSync(lockFile, String(deadPid()));
    vi.spyOn(fs, "readFileSync").mockImplementation((target, options) => {
      if (String(target) === vanishing) {
        vanished += 1;
        fs.rmSync(vanishing, { force: true });
        throw Object.assign(new Error("claim vanished"), { code: "ENOENT" });
      }
      return read(target, options);
    });

    expect(withStoreLock(store, ran)).toBe("ran");

    expect(vanished).toBe(1);
    expect(ran).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(lockFile)).toBe(false);
  });

  it("reclaims a dead claim while the lock is unreadable and still surfaces the read error", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const read = fs.readFileSync;
    const ran = vi.fn(() => "ran");
    const deadClaim = path.join(`${lockFile}.claims`, "dead-owner");
    fs.mkdirSync(path.dirname(deadClaim), { recursive: true });
    fs.writeFileSync(deadClaim, String(deadPid()));
    fs.writeFileSync(lockFile, String(deadPid()));
    vi.spyOn(fs, "readFileSync").mockImplementation((target, options) => {
      if (String(target) === lockFile) throw Object.assign(new Error("lock unreadable"), { code: "EACCES" });
      return read(target, options);
    });

    expect(() => withStoreLock(store, ran)).toThrow("lock unreadable");

    expect(ran).not.toHaveBeenCalled();
    expect(fs.existsSync(deadClaim)).toBe(false);
  });

  it.each(["ENOENT", "ENOTEMPTY", "EEXIST"])("tolerates %s when the claims directory cannot be removed", (code) => {
    const claimsDir = `${lockFile}.claims`;
    const rmdir = fs.rmdirSync;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const ran = vi.fn(() => "ran");
    vi.spyOn(fs, "rmdirSync").mockImplementation((target) => {
      if (String(target) === claimsDir) throw Object.assign(new Error("claims directory refused"), { code });
      return rmdir(target);
    });

    expect(withStoreLock(store, ran)).toBe("ran");

    expect(ran).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
    expect(fs.existsSync(lockFile)).toBe(false);
  });

  it.each(["ENOENT", "ENOTEMPTY", "EEXIST"])("tolerates %s when the claims directory retry is refused", (code) => {
    const claimsDir = `${lockFile}.claims`;
    const rmdir = fs.rmdirSync;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const ran = vi.fn(() => "ran");
    let attempts = 0;
    vi.spyOn(fs, "rmdirSync").mockImplementation((target) => {
      if (String(target) !== claimsDir) return rmdir(target);
      attempts += 1;
      throw Object.assign(new Error("claims directory refused"), { code: attempts === 1 ? "EPERM" : code });
    });

    expect(withStoreLock(store, ran)).toBe("ran");

    expect(warn).not.toHaveBeenCalled();
    expect(ran).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(lockFile)).toBe(false);
  });

  it("tells the caller to retry when a young claim has no pid and no lock file exists", () => {
    const claim = path.join(`${lockFile}.claims`, "incomplete");
    const ran = vi.fn(() => "ran");
    fs.mkdirSync(path.dirname(claim), { recursive: true });
    fs.writeFileSync(claim, "");

    const message = thrownMessage(() => withStoreLock(store, ran));

    expect(message).toContain(claim);
    expect(message).toContain("has not written its pid yet");
    expect(message).toContain("another run is starting, so retry shortly");
    expect(ran).not.toHaveBeenCalled();
    expect(fs.existsSync(claim)).toBe(true);
  });

  it("does not say another run is starting when a live claim is exactly at the grace period", () => {
    const base = 1_700_000_000_000;
    const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"]);
    const ran = vi.fn(() => "ran");
    try {
      if (child.pid === undefined) throw new Error("could not spawn a live child");
      const claim = path.join(`${lockFile}.claims`, `${child.pid}-00000000-0000-4000-8000-000000000000`);
      fs.mkdirSync(path.dirname(claim), { recursive: true });
      fs.writeFileSync(claim, String(child.pid));
      fs.utimesSync(claim, new Date(base), new Date(base));
      vi.spyOn(Date, "now").mockReturnValue(base + LOCK_CONTENT_GRACE_MS);

      const message = thrownMessage(() => withStoreLock(store, ran));

      expect(message).toContain(claim);
      expect(message).not.toContain("another run is starting");
      expect(ran).not.toHaveBeenCalled();
    } finally {
      child.kill();
    }
  });

  it("reclaims a claim with no pid once it is exactly at the grace period", () => {
    const base = 1_700_000_000_000;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const claim = path.join(`${lockFile}.claims`, "incomplete");
    const ran = vi.fn(() => "ran");
    fs.mkdirSync(path.dirname(claim), { recursive: true });
    fs.writeFileSync(claim, "");
    fs.utimesSync(claim, new Date(base), new Date(base));
    fs.writeFileSync(lockFile, String(deadPid()));
    vi.spyOn(Date, "now").mockReturnValue(base + LOCK_CONTENT_GRACE_MS);

    expect(withStoreLock(store, ran)).toBe("ran");

    expect(warn).toHaveBeenCalledWith(expect.stringContaining(lockFile));
    expect(ran).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(claim)).toBe(false);
  });

  it("reclaims an empty lock once it is exactly at the grace period", () => {
    const base = 1_700_000_000_000;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const ran = vi.fn(() => "ran");
    fs.writeFileSync(lockFile, "");
    fs.utimesSync(lockFile, new Date(base), new Date(base));
    vi.spyOn(Date, "now").mockReturnValue(base + LOCK_CONTENT_GRACE_MS);

    expect(withStoreLock(store, ran)).toBe("ran");

    expect(warn).toHaveBeenCalledWith(expect.stringContaining(lockFile));
    expect(ran).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(lockFile)).toBe(false);
  });

  it("tolerates a claims directory that vanishes before its entries are listed", () => {
    const claimsDir = `${lockFile}.claims`;
    const rmdir = fs.rmdirSync;
    const readdir = fs.readdirSync;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const ran = vi.fn(() => "ran");
    let removalAttempted = false;
    vi.spyOn(fs, "rmdirSync").mockImplementation((target, options) => {
      if (String(target) === claimsDir) {
        removalAttempted = true;
        throw Object.assign(new Error("claim directory cleanup denied"), { code: "EPERM" });
      }
      return rmdir(target, options);
    });
    vi.spyOn(fs, "readdirSync").mockImplementation((target, options) => {
      if (removalAttempted && String(target) === claimsDir) {
        throw Object.assign(new Error("claims directory vanished"), { code: "ENOENT" });
      }
      return readdir(target, options);
    });

    expect(withStoreLock(store, ran)).toBe("ran");

    expect(fs.existsSync(claimsDir)).toBe(true);
    expect(ran).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
    expect(fs.existsSync(lockFile)).toBe(false);
  });

  it("tolerates a claims directory that vanishes before the retry lists its entries", () => {
    const claimsDir = `${lockFile}.claims`;
    const rmdir = fs.rmdirSync;
    const readdir = fs.readdirSync;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const ran = vi.fn(() => "ran");
    let removalAttempts = 0;
    vi.spyOn(fs, "rmdirSync").mockImplementation((target, options) => {
      if (String(target) === claimsDir) {
        removalAttempts += 1;
        throw Object.assign(new Error("claim directory cleanup denied"), { code: "EPERM" });
      }
      return rmdir(target, options);
    });
    vi.spyOn(fs, "readdirSync").mockImplementation((target, options) => {
      if (removalAttempts > 1 && String(target) === claimsDir) {
        throw Object.assign(new Error("claims directory vanished"), { code: "ENOENT" });
      }
      return readdir(target, options);
    });

    expect(withStoreLock(store, ran)).toBe("ran");

    expect(fs.existsSync(claimsDir)).toBe(true);
    expect(ran).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
    expect(fs.existsSync(lockFile)).toBe(false);
  });

  it("removes its own claim when the claim reads back with another pid", () => {
    const claimsDir = `${lockFile}.claims`;
    const read = fs.readFileSync;
    const ran = vi.fn(() => "ran");
    let misread = 0;
    vi.spyOn(fs, "readFileSync").mockImplementation((target, options) => {
      if (misread === 0 && String(target).startsWith(`${claimsDir}${path.sep}`)) {
        misread += 1;
        return "0";
      }
      return read(target, options);
    });

    expect(withStoreLock(store, ran)).toBe("ran");

    expect(misread).toBe(1);
    expect(ran).toHaveBeenCalledTimes(1);
    expect(claimEntries()).toEqual([]);
  });

  it("leaves no claim behind when the lock is refused", () => {
    const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"]);
    const ran = vi.fn(() => "ran");
    try {
      if (child.pid === undefined) throw new Error("could not spawn a live child");
      fs.writeFileSync(lockFile, String(child.pid));

      expect(() => withStoreLock(store, ran)).toThrow(`Store lock ${lockFile} is held by process ${child.pid}`);

      expect(ran).not.toHaveBeenCalled();
      expect(claimEntries()).toEqual([]);
    } finally {
      child.kill();
    }
  });

  it("leaves no claim behind when claim inspection fails", () => {
    const claimsDir = `${lockFile}.claims`;
    const ran = vi.fn(() => "ran");
    fs.mkdirSync(claimsDir, { recursive: true });
    fs.writeFileSync(lockFile, String(deadPid()));
    vi.spyOn(fs, "readdirSync").mockImplementation(() => {
      throw Object.assign(new Error("claim directory unreadable"), { code: "EACCES" });
    });

    expect(() => withStoreLock(store, ran)).toThrow("claim directory unreadable");

    expect(ran).not.toHaveBeenCalled();
    expect(claimEntries()).toEqual([]);
  });

  it("keeps an empty lock held just under the grace period", () => {
    const base = 1_700_000_000_000;
    const ran = vi.fn(() => "ran");
    fs.writeFileSync(lockFile, "");
    fs.utimesSync(lockFile, new Date(base), new Date(base));
    vi.spyOn(Date, "now").mockReturnValue(base + LOCK_CONTENT_GRACE_MS - 1);

    expect(() => withStoreLock(store, ran)).toThrow(`Store lock ${lockFile} is held by`);

    expect(ran).not.toHaveBeenCalled();
    expect(fs.readFileSync(lockFile, "utf8")).toBe("");
  });

  it("reclaims an empty lock just over the grace period", () => {
    const base = 1_700_000_000_000;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const ran = vi.fn(() => "ran");
    fs.writeFileSync(lockFile, "");
    fs.utimesSync(lockFile, new Date(base), new Date(base));
    vi.spyOn(Date, "now").mockReturnValue(base + LOCK_CONTENT_GRACE_MS + 1);

    expect(withStoreLock(store, ran)).toBe("ran");

    expect(warn).toHaveBeenCalledWith(expect.stringContaining(lockFile));
    expect(ran).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(lockFile)).toBe(false);
  });

  it("keeps an empty claim held just under the grace period", () => {
    const base = 1_700_000_000_000;
    const claim = path.join(`${lockFile}.claims`, "incomplete");
    const ran = vi.fn(() => "ran");
    fs.mkdirSync(path.dirname(claim), { recursive: true });
    fs.writeFileSync(claim, "");
    fs.utimesSync(claim, new Date(base), new Date(base));
    fs.writeFileSync(lockFile, String(deadPid()));
    vi.spyOn(Date, "now").mockReturnValue(base + LOCK_CONTENT_GRACE_MS - 1);

    expect(() => withStoreLock(store, ran)).toThrow(claim);

    expect(ran).not.toHaveBeenCalled();
    expect(fs.existsSync(claim)).toBe(true);
  });

  it("reclaims an empty claim just over the grace period", () => {
    const base = 1_700_000_000_000;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const claim = path.join(`${lockFile}.claims`, "incomplete");
    const ran = vi.fn(() => "ran");
    fs.mkdirSync(path.dirname(claim), { recursive: true });
    fs.writeFileSync(claim, "");
    fs.utimesSync(claim, new Date(base), new Date(base));
    fs.writeFileSync(lockFile, String(deadPid()));
    vi.spyOn(Date, "now").mockReturnValue(base + LOCK_CONTENT_GRACE_MS + 1);

    expect(withStoreLock(store, ran)).toBe("ran");

    expect(warn).toHaveBeenCalledWith(expect.stringContaining(lockFile));
    expect(ran).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(claim)).toBe(false);
  });

  it("tolerates the lock vanishing before release", () => {
    expect(
      withStoreLock(store, () => {
        fs.rmSync(lockFile, { force: true });
        return "ran";
      })
    ).toBe("ran");

    expect(fs.existsSync(lockFile)).toBe(false);
  });

  it("surfaces a close error after a successful pid write and removes the lock file", () => {
    const open = fs.openSync;
    const close = fs.closeSync;
    let lockDescriptor: number | undefined;
    const closeError = Object.assign(new Error("close failed"), { code: "EIO" });
    vi.spyOn(fs, "openSync").mockImplementation((...args) => {
      const fd = open(...args);
      if (String(args[0]) === lockFile) lockDescriptor = fd;
      return fd;
    });
    vi.spyOn(fs, "closeSync").mockImplementation((fd) => {
      close(fd);
      if (fd === lockDescriptor) throw closeError;
    });

    let thrown: unknown;
    try {
      withStoreLock(store, () => "ran");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(closeError);
    expect(fs.existsSync(lockFile)).toBe(false);
    expect(claimEntries()).toEqual([]);
  });

  it("closes the claim descriptor after a failed pid write", () => {
    const claimsDir = `${lockFile}.claims`;
    const open = fs.openSync;
    const close = fs.closeSync;
    const writeFile = fs.writeFileSync;
    const claimDescriptors = new Set<number>();
    const closed: number[] = [];
    vi.spyOn(fs, "openSync").mockImplementation((...args) => {
      const fd = open(...args);
      if (String(args[0]).startsWith(`${claimsDir}${path.sep}`)) claimDescriptors.add(fd);
      return fd;
    });
    vi.spyOn(fs, "writeFileSync").mockImplementation((file, data, options) => {
      if (typeof file === "number" && claimDescriptors.has(file)) {
        throw Object.assign(new Error("no space left on device"), { code: "ENOSPC" });
      }
      return writeFile(file, data, options);
    });
    vi.spyOn(fs, "closeSync").mockImplementation((fd) => {
      closed.push(fd);
      close(fd);
    });

    expect(() => withStoreLock(store, () => "ran")).toThrow("no space left on device");

    expect(claimDescriptors.size).toBe(1);
    for (const fd of claimDescriptors) expect(closed).toContain(fd);
  });

  it("places the lock beside the store when the store path has a trailing separator", () => {
    const storeWithSeparator = `${store}${path.sep}`;
    let lockDuringCallback = false;
    let lockInsideStore = true;

    expect(
      withStoreLock(storeWithSeparator, () => {
        lockDuringCallback = fs.existsSync(lockFile);
        lockInsideStore = fs.existsSync(path.join(store, ".lock"));
        return "ran";
      })
    ).toBe("ran");

    expect(lockFileFor(storeWithSeparator)).toBe(lockFile);
    expect(path.dirname(lockFileFor(storeWithSeparator))).toBe(dir);
    expect(lockDuringCallback).toBe(true);
    expect(lockInsideStore).toBe(false);
  });

  it("creates a missing parent directory, runs the callback and leaves no lock file behind", () => {
    const nested = path.join(dir, "nested", "decks");

    expect(withStoreLock(nested, () => 42)).toBe(42);

    expect(fs.readdirSync(path.dirname(lockFileFor(nested)))).toEqual([]);
  });
});
