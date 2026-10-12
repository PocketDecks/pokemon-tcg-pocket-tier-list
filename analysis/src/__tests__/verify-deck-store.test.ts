import fs from "fs";
import os from "os";
import path from "path";
import { vi } from "vitest";
import { planDeckWrites } from "../utils/deck-store";
import { Deck } from "../utils/types";
import { runVerify } from "../../scripts/verify-deck-store";

const makeDeck = (id: string, date: string): Deck => ({
  id,
  name: "",
  cards: [],
  pokemon: 0,
  differentPokemon: 0,
  winCount: 1,
  lossCount: 1,
  totalGames: 2,
  date,
  tournamentExPercent: 0.5,
  noTrainerPercent: 0,
  wins: [],
  losses: [],
});

const commit = (files: Record<string, string>) => {
  for (const [target, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
};

describe("verify-deck-store", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "verify-store-"));
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("fails and names the path when the store directory is absent", () => {
    const absent = path.join(dir, "absent");

    expect(runVerify({ dir: absent })).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining(absent));
  });

  it("fails when the directory holds no shards", () => {
    expect(runVerify({ dir })).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining(dir));
  });

  it("accepts an empty store when allowEmpty is set", () => {
    expect(runVerify({ dir, allowEmpty: true })).toBe(0);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("0 shards, 0 decks"));
  });

  it("passes a healthy store", () => {
    commit(planDeckWrites(dir, [makeDeck("a", "2026-09-01T10:00:00.000Z")]));

    expect(runVerify({ dir })).toBe(0);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("1 shards, 1 decks"));
  });
});
