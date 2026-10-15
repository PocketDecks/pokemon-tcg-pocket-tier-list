import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { vi } from "vitest";
import { LOCK_CONTENT_GRACE_MS, lockFileFor, withStoreLock } from "../utils/store-lock";

// A pid that has exited, so process.kill reports ESRCH for it.
const deadPid = (): number => {
  const child = spawnSync(process.execPath, ["-e", ""]);
  if (child.pid === undefined) throw new Error("could not spawn a child to obtain a dead pid");
  return child.pid;
};

// An mtime older than the grace period, so a file whose contents name no
// writer counts as abandoned.
const backdate = (file: string): void => {
  const old = new Date(Date.now() - LOCK_CONTENT_GRACE_MS * 2);
  fs.utimesSync(file, old, old);
};

// The lock file sits beside the store directory, so a store tree read with
// readdir never holds it.
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

  it("throws and names the holding pid when the lock is already held", () => {
    fs.writeFileSync(lockFile, String(process.pid));

    expect(() => withStoreLock(store, () => "ran")).toThrow(lockFile);
    expect(() => withStoreLock(store, () => "ran")).toThrow(String(process.pid));
    // The attempt that lost the race must leave the holder's lock in place.
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
    // A pid of 0 signals the whole process group, so process.kill(0, 0)
    // reports success. The contents name no writer this process can check, so
    // the file counts as held until the grace period passes.
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

  it("leaves a lock whose contents changed under it alone and reports it as held", () => {
    fs.writeFileSync(lockFile, String(deadPid()));
    const rename = fs.renameSync;
    // A live writer replaces the lock between the read that inspects it and
    // the rename that claims it, so the file the rename moves belongs to that
    // writer.
    vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
      if (String(from) === lockFile) fs.writeFileSync(lockFile, String(process.pid));
      rename(from, to);
    });

    expect(() => withStoreLock(store, () => "ran")).toThrow(String(process.pid));

    expect(fs.readFileSync(lockFile, "utf8")).toBe(String(process.pid));
  });

  it("retries the exclusive create when the lock file is gone by the time it reads it", () => {
    const write = fs.writeFileSync;
    let first = true;
    const create = vi.spyOn(fs, "writeFileSync").mockImplementation((file, data, options) => {
      // The holder releases the lock between our failed create and the read
      // that follows, so the read finds no file.
      if (first) {
        first = false;
        throw Object.assign(new Error("lock file exists"), { code: "EEXIST" });
      }
      write(file, data, options);
    });

    expect(withStoreLock(store, () => "ran")).toBe("ran");

    expect(create).toHaveBeenCalled();
    expect(fs.existsSync(lockFile)).toBe(false);
  });

  it("leaves another process's lock file in place when the file no longer holds our pid", () => {
    const otherPid = String(process.pid + 1);

    expect(
      withStoreLock(store, () => {
        // Another process reclaimed the stale lock while the callback ran, so
        // the file now holds that process's pid.
        fs.writeFileSync(lockFile, otherPid);
        return "ran";
      })
    ).toBe("ran");

    expect(fs.readFileSync(lockFile, "utf8")).toBe(otherPid);
  });

  it("creates a missing parent directory, runs the callback and leaves no lock file behind", () => {
    const nested = path.join(dir, "nested", "decks");

    expect(withStoreLock(nested, () => 42)).toBe(42);

    // readdir throws when the parent is absent, so the empty listing proves
    // both that the directory was created and that no lock file survives.
    expect(fs.readdirSync(path.dirname(lockFileFor(nested)))).toEqual([]);
  });
});
