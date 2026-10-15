import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { vi } from "vitest";
import { lockFileFor, withStoreLock } from "../utils/store-lock";

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
    const gonePid = spawnSync(process.execPath, ["-e", ""]).pid;
    if (gonePid === undefined) throw new Error("could not spawn a child to obtain a dead pid");
    fs.writeFileSync(lockFile, String(gonePid));

    expect(withStoreLock(store, () => "ran")).toBe("ran");

    expect(warn).toHaveBeenCalledWith(expect.stringContaining(String(gonePid)));
    expect(fs.existsSync(lockFile)).toBe(false);
  });

  it("creates a missing parent directory, runs the callback and leaves no lock file behind", () => {
    const nested = path.join(dir, "nested", "decks");

    expect(withStoreLock(nested, () => 42)).toBe(42);

    // readdir throws when the parent is absent, so the empty listing proves
    // both that the directory was created and that no lock file survives.
    expect(fs.readdirSync(path.dirname(lockFileFor(nested)))).toEqual([]);
  });
});
