import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { lockFileFor, withStoreLock } from "../utils/store-lock";

const { getDecks, writeArtefacts, DECKS_DIR } = vi.hoisted(() => ({
  getDecks: vi.fn(() => []),
  writeArtefacts: vi.fn(),
  DECKS_DIR: `${require("node:os").tmpdir()}/store-lock-run-store`,
}));

vi.mock("../load-env-side-effect", () => ({}));
vi.mock("../utils/data-paths", () => ({ decksDir: () => DECKS_DIR }));
vi.mock("../utils/get-decks", () => ({ default: getDecks }));
vi.mock("../utils/write-artifacts", () => ({ writeArtefacts }));
vi.mock("../utils/calculate-card-scores", () => ({ calculateCardScores: () => ({}) }));
vi.mock("../utils/generate-og-images", () => ({
  stageOgImages: async () => ({ commit: vi.fn(), discard: vi.fn() }),
}));
vi.mock("../utils/assert-publishable", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../utils/assert-publishable")>();
  return {
    ...actual,
    assertPublishable: vi.fn(),
    readPreviousArchetypeCount: vi.fn(() => null),
  };
});

import { run } from "../get-best-decks";

describe("store lock around get-best-decks", () => {
  it("holds the lock during the deck read and artefact write", async () => {
    const lockFile = lockFileFor(DECKS_DIR);
    getDecks.mockImplementationOnce(() => {
      expect(fs.existsSync(lockFile)).toBe(true);
      return [];
    });
    writeArtefacts.mockImplementationOnce(() => {
      expect(fs.existsSync(lockFile)).toBe(true);
    });
    await run();
    expect(getDecks).toHaveBeenCalledTimes(1);
    expect(writeArtefacts).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(lockFile)).toBe(false);
  });

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
