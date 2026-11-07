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

describe("withStoreLock", () => {
  let dir: string;
  let store: string;
  let lockFile: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "store-lock-"));
    store = path.join(dir, "decks");
    lockFile = lockFileFor(store);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("retries when the claims directory disappears during creation", () => {
    const claimsDir = `${lockFile}.claims`;
    const mkdir = fs.mkdirSync;
    let attempts = 0;
    vi.spyOn(fs, "mkdirSync").mockImplementation((target, options) => {
      if (String(target) === claimsDir) {
        attempts += 1;
        if (attempts === 1) {
          throw Object.assign(new Error("claims directory disappeared"), { code: "ENOENT" });
        }
      }
      return mkdir(target, options);
    });

    expect(withStoreLock(store, () => "ran")).toBe("ran");

    expect(attempts).toBe(2);
    expect(fs.existsSync(lockFile)).toBe(false);
    expect(fs.existsSync(claimsDir)).toBe(false);
  });

  it("throws and names the holding pid when the lock is already held", () => {
    fs.writeFileSync(lockFile, String(process.pid));

    expect(() => withStoreLock(store, () => "ran")).toThrow(lockFile);
    expect(() => withStoreLock(store, () => "ran")).toThrow(String(process.pid));
    expect(fs.readFileSync(lockFile, "utf8")).toBe(String(process.pid));
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

    expect(() => withStoreLock(store, ran)).toThrow(lockFile);

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

    expect(() => withStoreLock(store, ran)).toThrow(lockFile);

    expect(ran).not.toHaveBeenCalled();
    expect(fs.existsSync(claim)).toBe(true);
    expect(fs.readFileSync(lockFile, "utf8")).toBe(String(stalePid));
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

    expect(() => withStoreLock(store, ran)).toThrow(String(process.pid));

    expect(ran).not.toHaveBeenCalled();
    expect(fs.readFileSync(claim, "utf8")).toBe("");
    expect(fs.readFileSync(lockFile, "utf8")).toBe(String(stalePid));
  });

  it("fails closed when it cannot inspect claim entries", () => {
    const claimsDir = `${lockFile}.claims`;
    const ran = vi.fn(() => "ran");
    let inspections = 0;
    const stalePid = deadPid();
    fs.mkdirSync(claimsDir, { recursive: true });
    fs.writeFileSync(lockFile, String(stalePid));
    vi.spyOn(fs, "readdirSync").mockImplementation(() => {
      inspections += 1;
      throw Object.assign(new Error("claim directory unreadable"), { code: "EACCES" });
    });

    expect(() => withStoreLock(store, ran)).toThrow("claim directory unreadable");

    expect(inspections).toBe(1);
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
    const write = fs.writeFileSync;
    let claimDisappeared = 0;
    let claimWrites = 0;
    fs.mkdirSync(claimsDir, { recursive: true });
    fs.writeFileSync(staleClaim, String(deadPid()));
    fs.writeFileSync(lockFile, String(deadPid()));
    vi.spyOn(fs, "writeFileSync").mockImplementation((target, data, options) => {
      if (String(target).startsWith(`${claimsDir}${path.sep}`)) claimWrites += 1;
      write(target, data, options);
    });
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
    expect(claimWrites).toBe(2);
    expect(ranWithClaim).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(lockFile)).toBe(false);
  });

  it("keeps callbacks excluded when a live owner replaces a stale lock during recovery", () => {
    fs.writeFileSync(lockFile, String(deadPid()));
    const rename = fs.renameSync;
    const contenderCallback = vi.fn(() => "ran");
    let replacementWritten = 0;
    let replacementMoved = 0;
    let contenderAttempted = 0;
    let contenderRejected = 0;
    let contenderError = "";
    vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
      if (String(from) === lockFile && replacementWritten === 0) {
        replacementWritten += 1;
        fs.writeFileSync(lockFile, String(process.pid));
      }
      rename(from, to);
      if (String(from) === lockFile) {
        replacementMoved += 1;
        contenderAttempted += 1;
        try {
          withStoreLock(store, contenderCallback);
        } catch (error) {
          contenderRejected += 1;
          contenderError = String(error);
        }
      }
    });

    expect(() => withStoreLock(store, () => "ran")).toThrow(String(process.pid));

    expect(replacementWritten).toBe(1);
    expect(replacementMoved).toBe(1);
    expect(contenderAttempted).toBe(1);
    expect(contenderCallback).not.toHaveBeenCalled();
    expect(contenderRejected).toBe(1);
    expect(contenderError).toContain(lockFile);
    expect(contenderError).toContain(String(process.pid));
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

      expect(() => withStoreLock(store, ran)).toThrow(`process ${child.pid}`);

      expect(ran).not.toHaveBeenCalled();
      expect(fs.existsSync(claim)).toBe(true);
      expect(fs.existsSync(lockFile)).toBe(false);
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
    let refusedRmdir = 0;
    vi.spyOn(fs, "rmdirSync").mockImplementation((target) => {
      if (String(target) === claimsDir && fs.readdirSync(claimsDir).length > 0) {
        refusedRmdir += 1;
        throw Object.assign(new Error("directory not empty"), { code: "EPERM" });
      }
      return rmdir(target);
    });

    expect(
      withStoreLock(store, () => {
        expect(() => withStoreLock(store, nestedCallback)).toThrow(lockFile);
        return "outer";
      })
    ).toBe("outer");

    expect(refusedRmdir).toBe(1);
    expect(nestedCallback).not.toHaveBeenCalled();
    expect(fs.existsSync(claimsDir)).toBe(false);
  });

  it("retries claim directory removal after a peer exits during EPERM cleanup", () => {
    const claimsDir = `${lockFile}.claims`;
    const peer = path.join(claimsDir, `${process.pid + 1}-00000000-0000-4000-8000-000000000000`);
    const remove = fs.rmSync;
    const rmdir = fs.rmdirSync;
    let peerCreated = 0;
    let refusedRmdir = 0;
    vi.spyOn(fs, "rmSync").mockImplementation((target, options) => {
      remove(target, options);
      if (String(target).startsWith(`${claimsDir}${path.sep}`) && peerCreated === 0) {
        peerCreated += 1;
        fs.writeFileSync(peer, String(process.pid + 1));
      }
    });
    vi.spyOn(fs, "rmdirSync").mockImplementation((target) => {
      if (String(target) === claimsDir && fs.readdirSync(claimsDir).length > 0) {
        refusedRmdir += 1;
        remove(peer, { force: true });
        throw Object.assign(new Error("directory not empty"), { code: "EPERM" });
      }
      return rmdir(target);
    });

    expect(withStoreLock(store, () => "ran")).toBe("ran");

    expect(peerCreated).toBe(1);
    expect(refusedRmdir).toBe(1);
    expect(fs.existsSync(claimsDir)).toBe(false);
  });

  it("surfaces persistent EPERM when claim directory cleanup sees an empty directory", () => {
    const claimsDir = `${lockFile}.claims`;
    const rmdir = fs.rmdirSync;
    const ran = vi.fn(() => "ran");
    let attempts = 0;
    vi.spyOn(fs, "rmdirSync").mockImplementation((target) => {
      if (String(target) === claimsDir) {
        attempts += 1;
        throw Object.assign(new Error("claim directory cleanup denied"), { code: "EPERM" });
      }
      return rmdir(target);
    });

    expect(() => withStoreLock(store, ran)).toThrow("claim directory cleanup denied");

    expect(attempts).toBe(2);
    expect(ran).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(lockFile)).toBe(false);
    expect(fs.readdirSync(claimsDir)).toEqual([]);
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

  it("creates a missing parent directory, runs the callback and leaves no lock file behind", () => {
    const nested = path.join(dir, "nested", "decks");

    expect(withStoreLock(nested, () => 42)).toBe(42);

    expect(fs.readdirSync(path.dirname(lockFileFor(nested)))).toEqual([]);
  });
});
