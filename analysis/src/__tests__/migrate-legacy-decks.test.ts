import fs from "fs";
import os from "os";
import path from "path";
import { readDecks, readManifest } from "../utils/deck-store";
import { migrateLegacyDecks } from "../utils/migrate-legacy-decks";

const deck = (id: string, date: string) => ({
  id,
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

describe("migrateLegacyDecks", () => {
  let dir: string;
  let legacy: string;
  let target: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "migrate-decks-"));
    legacy = path.join(dir, "decks.json");
    target = path.join(dir, "decks");
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("splits a legacy file into one shard per expansion without losing a deck", () => {
    const decks = [
      deck("a", "2024-10-01T00:00:00.000Z"),
      deck("b", "2025-02-01T00:00:00.000Z"),
      deck("c", "2025-02-02T00:00:00.000Z"),
      deck("d", "2026-09-01T00:00:00.000Z"),
    ];
    fs.writeFileSync(legacy, JSON.stringify(decks));

    const result = migrateLegacyDecks(legacy, target);

    expect(result.perShard).toEqual({ a2: 2, b4a: 1, pre: 1 });
    expect(result).toMatchObject({ legacy: 4, stored: 4, problems: [] });
    expect(readDecks(target).map((entry) => entry.id).sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("leaves the legacy file untouched", () => {
    fs.writeFileSync(legacy, JSON.stringify([deck("a", "2026-09-01T00:00:00.000Z")]));
    const before = fs.readFileSync(legacy, "utf8");

    migrateLegacyDecks(legacy, target);

    expect(fs.readFileSync(legacy, "utf8")).toBe(before);
  });

  it("refuses to overwrite a store that is already migrated", () => {
    fs.writeFileSync(legacy, JSON.stringify([deck("a", "2026-09-01T00:00:00.000Z")]));
    migrateLegacyDecks(legacy, target);

    expect(() => migrateLegacyDecks(legacy, target)).toThrow("already holds a migrated store");
    expect(Object.keys(readManifest(target).shards)).toEqual(["b4a"]);
  });

  it("rejects a missing file and a file that is not a list", () => {
    expect(() => migrateLegacyDecks(legacy, target)).toThrow("Legacy decks file not found");
    fs.writeFileSync(legacy, "{}");
    expect(() => migrateLegacyDecks(legacy, target)).toThrow("must contain an array");
  });

  it("rejects a legacy list with a repeated deck id", () => {
    fs.writeFileSync(
      legacy,
      JSON.stringify([deck("a", "2026-09-01T00:00:00.000Z"), deck("a", "2026-09-02T00:00:00.000Z")])
    );
    expect(() => migrateLegacyDecks(legacy, target)).toThrow("appears twice in one batch");
  });
});
