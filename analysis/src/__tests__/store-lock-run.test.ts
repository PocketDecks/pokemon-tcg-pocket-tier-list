import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { lockFileFor, withStoreLock } from "../utils/store-lock";

describe("store lock around get-best-decks", () => {
  it("refuses a second holder while a run holds the lock", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "store-lock-run-"));
    const lockFile = lockFileFor(dir);
    withStoreLock(dir, () => {
      expect(fs.existsSync(lockFile)).toBe(true);
      expect(() => withStoreLock(dir, () => {})).toThrow(/held by process/);
    });
    expect(fs.existsSync(lockFile)).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("releases the lock when the run throws", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "store-lock-throw-"));
    expect(() =>
      withStoreLock(dir, () => {
        throw new Error("run failed");
      })
    ).toThrow("run failed");
    expect(fs.existsSync(lockFileFor(dir))).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
