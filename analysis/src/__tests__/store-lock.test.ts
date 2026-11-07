import { spawn, spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { vi } from "vitest";
import { LOCK_CONTENT_GRACE_MS, lockFileFor, withStoreLock } from "../utils/store-lock";

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
    fs.writeFileSync(lockFile, String(process.pid));
    const heldMessage = `Store lock ${lockFile} is held by process ${process.pid}`;

    expect(() => withStoreLock(store, () => "ran")).toThrow(heldMessage);
    expect(claimEntries()).toEqual([]);
    expect(() => withStoreLock(store, () => "ran")).toThrow(heldMessage);
    expect(fs.readFileSync(lockFile, "utf8")).toBe(String(process.pid));
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
    expect(fs.existsSync(`${lockFile}.claims`) ? fs.readdirSync(`${lockFile}.claims`) : []).toEqual([]);
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

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("holds pid 0, which is not running"));
    expect(fs.existsSync(lockFile)).toBe(false);
  });

  it("treats an empty lock file with a fresh mtime as held", () => {
    const ran = vi.fn(() => "ran");
    fs.writeFileSync(lockFile, "");

    expect(() => withStoreLock(store, ran)).toThrow(`Store lock ${lockFile} is held by`);

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

  it("names this process without a retry suffix when a young own-pid claim is left behind", () => {
    const claimsDir = `${lockFile}.claims`;
    const leftover = path.join(claimsDir, `${process.pid}-00000000-0000-4000-8000-000000000000`);
    const ran = vi.fn(() => "ran");
    fs.mkdirSync(claimsDir, { recursive: true });
    fs.writeFileSync(leftover, String(process.pid));

    const message = thrownMessage(() => withStoreLock(store, ran));

    expect(message).toContain(leftover);
    expect(message).toContain(`process ${process.pid}`);
    expect(message).toContain("could not remove it");
    expect(message).not.toContain("retry shortly");
    expect(ran).not.toHaveBeenCalled();
    expect(fs.existsSync(leftover)).toBe(true);
  });

  it("keeps an aged empty claim held when its filename names a live pid", () => {
    const claimsDir = `${lockFile}.claims`;
    const claim = path.join(claimsDir, `${process.pid}-00000000-0000-4000-8000-000000000000`);
    const stalePid = deadPid();
    const ran = vi.fn(() => "ran");
    fs.mkdirSync(claimsDir, { recursive: true });
    fs.writeFileSync(claim, "");
    backdate(claim);
    fs.writeFileSync(lockFile, String(stalePid));

    const message = thrownMessage(() => withStoreLock(store, ran));

    expect(message).toContain(claim);
    expect(message).toContain(`process ${process.pid}`);
    expect(message).not.toContain("remove the lock file");
    expect(ran).not.toHaveBeenCalled();
    expect(fs.readFileSync(claim, "utf8")).toBe("");
    expect(fs.readFileSync(lockFile, "utf8")).toBe(String(stalePid));
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
    expect(fs.existsSync(`${lockFile}.claims`) ? fs.readdirSync(`${lockFile}.claims`) : []).toEqual([]);
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

  it("keeps the lock held and names the live pid when a stale lock changes before removal", () => {
    const read = fs.readFileSync;
    const ran = vi.fn(() => "ran");
    let reads = 0;
    fs.writeFileSync(lockFile, String(deadPid()));
    vi.spyOn(fs, "readFileSync").mockImplementation((target, options) => {
      if (String(target) === lockFile) {
        reads += 1;
        if (reads === 2) fs.writeFileSync(lockFile, String(process.pid));
      }
      return read(target, options);
    });

    expect(() => withStoreLock(store, ran)).toThrow(`Store lock ${lockFile} is held by process ${process.pid}`);

    expect(reads).toBe(2);
    expect(ran).not.toHaveBeenCalled();
    expect(fs.readFileSync(lockFile, "utf8")).toBe(String(process.pid));
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
        expect(() => withStoreLock(store, nestedCallback)).toThrow(`Store lock claim ${claimsDir}${path.sep}`);
        return "outer";
      })
    ).toBe("outer");

    expect(nestedCallback).not.toHaveBeenCalled();
    expect(fs.existsSync(claimsDir)).toBe(false);
  });

  it("retries claim directory removal after a peer exits during EPERM cleanup", () => {
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
    expect(fs.existsSync(claimsDir)).toBe(false);
  });

  it("warns and keeps the result when claim directory cleanup sees a persistent EPERM on an empty directory", () => {
    const claimsDir = `${lockFile}.claims`;
    const rmdir = fs.rmdirSync;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const ran = vi.fn(() => "ran");
    let attempts = 0;
    vi.spyOn(fs, "rmdirSync").mockImplementation((target) => {
      if (String(target) === claimsDir) {
        attempts += 1;
        throw Object.assign(new Error("claim directory cleanup denied"), { code: "EPERM" });
      }
      return rmdir(target);
    });

    expect(withStoreLock(store, ran)).toBe("ran");

    expect(attempts).toBe(2);
    expect(ran).toHaveBeenCalledTimes(1);
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
      if (claimDescriptors.has(file as number) && failedWrites === 0) {
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
    expect(fs.existsSync(claimsDir) ? fs.readdirSync(claimsDir) : []).toEqual([]);
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

  it("does not accept a claim whose pid write is short", () => {
    const claimsDir = `${lockFile}.claims`;
    const open = fs.openSync;
    const write = fs.writeSync;
    const claimDescriptors = new Set<number>();
    let shortWrites = 0;
    const ran = vi.fn(() => "ran");
    vi.spyOn(fs, "openSync").mockImplementation((...args) => {
      const fd = open(...args);
      if (String(args[0]).startsWith(`${claimsDir}${path.sep}`)) claimDescriptors.add(fd);
      return fd;
    });
    vi.spyOn(fs, "writeSync").mockImplementation((...args) => {
      if (claimDescriptors.has(args[0]) && shortWrites < 100) {
        shortWrites += 1;
        return 0;
      }
      return write(...args);
    });

    expect(withStoreLock(store, ran)).toBe("ran");

    expect(ran).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(lockFile)).toBe(false);
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
      if (claimDescriptors.has(file as number)) throw writeError;
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
    expect(aggregate.message).toContain("no space left on device");
    expect(aggregate.errors).toHaveLength(3);
    expect(aggregate.errors[0]).toBe(writeError);
    expect(aggregate.errors[1]).toBe(lockCleanupError);
    expect(aggregate.errors[2]).toBe(claimCleanupError);
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
    expect(aggregate.errors).toHaveLength(2);
    expect(aggregate.errors[0]).toBe(writeError);
    expect(aggregate.errors[1]).toBe(closeError);
    expect(fs.existsSync(lockFile)).toBe(false);
  });

  it("removes its claim once when the read-back mismatch removal fails", () => {
    const claimsDir = `${lockFile}.claims`;
    const read = fs.readFileSync;
    const remove = fs.rmSync;
    const cleanupError = Object.assign(new Error("claim removal denied"), { code: "EACCES" });
    const ran = vi.fn(() => "ran");
    let misread = 0;
    let claimRemovals = 0;
    vi.spyOn(fs, "readFileSync").mockImplementation((target, options) => {
      if (misread === 0 && String(target).startsWith(`${claimsDir}${path.sep}`)) {
        misread += 1;
        return "0";
      }
      return read(target, options);
    });
    vi.spyOn(fs, "rmSync").mockImplementation((target, options) => {
      if (String(target).startsWith(`${claimsDir}${path.sep}`)) {
        claimRemovals += 1;
        throw cleanupError;
      }
      remove(target, options);
    });

    let thrown: unknown;
    try {
      withStoreLock(store, ran);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(cleanupError);
    expect(claimRemovals).toBe(1);
    expect(ran).not.toHaveBeenCalled();
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
    const claimsDir = `${lockFile}.claims`;
    const remove = fs.rmSync;
    const cleanupError = Object.assign(new Error("claim removal denied"), { code: "EACCES" });
    fs.writeFileSync(lockFile, String(process.pid));
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

    expect(thrown).toBeInstanceOf(AggregateError);
    const aggregate = thrown as AggregateError;
    expect(aggregate.message).toContain(`Store lock ${lockFile} is held by`);
    expect(aggregate.errors).toHaveLength(2);
    expect(aggregate.errors[1]).toBe(cleanupError);
    expect(ran).not.toHaveBeenCalled();
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

  it.each(["ENOENT", "ENOTEMPTY", "EEXIST"])("tolerates %s when the claims directory cannot be removed", (code) => {
    const claimsDir = `${lockFile}.claims`;
    const rmdir = fs.rmdirSync;
    const ran = vi.fn(() => "ran");
    vi.spyOn(fs, "rmdirSync").mockImplementation((target) => {
      if (String(target) === claimsDir) throw Object.assign(new Error("claims directory refused"), { code });
      return rmdir(target);
    });

    expect(withStoreLock(store, ran)).toBe("ran");

    expect(ran).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(lockFile)).toBe(false);
  });

  it.each(["ENOENT", "ENOTEMPTY", "EEXIST"])("tolerates %s when the claims directory retry is refused", (code) => {
    const claimsDir = `${lockFile}.claims`;
    const rmdir = fs.rmdirSync;
    const ran = vi.fn(() => "ran");
    let attempts = 0;
    vi.spyOn(fs, "rmdirSync").mockImplementation((target) => {
      if (String(target) !== claimsDir) return rmdir(target);
      attempts += 1;
      throw Object.assign(new Error("claims directory refused"), { code: attempts === 1 ? "EPERM" : code });
    });

    expect(withStoreLock(store, ran)).toBe("ran");

    expect(attempts).toBe(2);
    expect(ran).toHaveBeenCalledTimes(1);
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
    expect(fs.existsSync(`${lockFile}.claims`) ? fs.readdirSync(`${lockFile}.claims`) : []).toEqual([]);
  });

  it("leaves no claim behind when the lock is refused", () => {
    fs.writeFileSync(lockFile, String(process.pid));
    const ran = vi.fn(() => "ran");

    expect(() => withStoreLock(store, ran)).toThrow(`Store lock ${lockFile} is held by process ${process.pid}`);

    expect(ran).not.toHaveBeenCalled();
    expect(fs.existsSync(`${lockFile}.claims`) ? fs.readdirSync(`${lockFile}.claims`) : []).toEqual([]);
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
    expect(fs.existsSync(claimsDir) ? fs.readdirSync(claimsDir, { withFileTypes: false }) : []).toEqual([]);
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
      if (claimDescriptors.has(file as number)) {
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
