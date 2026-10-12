import fs from "fs";
import os from "os";
import path from "path";
import { vi } from "vitest";
import { BATCH_SIZE, downloadDecks, readProcessed } from "../download-decks";
import { readDecks, readManifest, verifyStore } from "../utils/deck-store";

const { getTournamentDecks, getTournaments } = vi.hoisted(() => ({
  getTournamentDecks: vi.fn(),
  getTournaments: vi.fn(),
}));

vi.mock("../utils/get-tournament-decks", () => ({ default: getTournamentDecks }));
vi.mock("../utils/get-tournaments", () => ({ getTournaments }));

const DATE = "2026-09-02T00:00:00.000Z";

const tournament = (n: number) => ({ id: `t${n}`, date: DATE });

const deck = (id: string) => ({
  id,
  cards: [],
  pokemon: 0,
  differentPokemon: 0,
  winCount: 1,
  lossCount: 1,
  totalGames: 2,
  date: DATE,
  tournamentExPercent: 0.5,
  noTrainerPercent: 0,
  wins: [],
  losses: [],
});

const tournaments = (count: number) => Array.from({ length: count }, (_, n) => tournament(n));

describe("downloadDecks", () => {
  let dataDir: string;

  const processedIds = (): string[] =>
    (JSON.parse(fs.readFileSync(path.join(dataDir, "processed-tournaments.json"), "utf8")) as { id: string }[]).map(
      (entry) => entry.id
    );

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "download-decks-"));
    vi.clearAllMocks();
    vi.stubEnv("ANALYSIS_DATA_DIR", dataDir);
    vi.stubEnv("DECKS_DIR", "");
    vi.stubEnv("LIMITLESS_API_KEY", "test-key");
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    getTournamentDecks.mockImplementation(async (t: { id: string }) => [deck(`${t.id}-player`)]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it("stores every deck and records every tournament across several batches", async () => {
    getTournaments.mockResolvedValue(tournaments(BATCH_SIZE * 2 + 5));

    await downloadDecks();

    expect(processedIds()).toHaveLength(BATCH_SIZE * 2 + 5);
    expect(readDecks(path.join(dataDir, "decks"))).toHaveLength(BATCH_SIZE * 2 + 5);
    expect(verifyStore(path.join(dataDir, "decks"), { placement: true })).toEqual([]);
  });

  it("keeps the batches that finished when a later batch fails", async () => {
    getTournaments.mockResolvedValue(tournaments(BATCH_SIZE * 2 + 5));
    getTournamentDecks.mockImplementation(async (t: { id: string }) => {
      if (t.id === `t${BATCH_SIZE + 5}`) throw new Error("pairings failed");
      return [deck(`${t.id}-player`)];
    });

    await expect(downloadDecks()).rejects.toThrow("pairings failed");

    expect(processedIds()).toHaveLength(BATCH_SIZE);
    expect(readDecks(path.join(dataDir, "decks"))).toHaveLength(BATCH_SIZE);
    expect(verifyStore(path.join(dataDir, "decks"))).toEqual([]);
  });

  it("resumes after a failure without duplicating a deck", async () => {
    getTournaments.mockResolvedValue(tournaments(BATCH_SIZE * 2));
    getTournamentDecks.mockImplementation(async (t: { id: string }) => {
      if (t.id === `t${BATCH_SIZE + 1}`) throw new Error("rate limited");
      return [deck(`${t.id}-player`)];
    });
    await expect(downloadDecks()).rejects.toThrow("rate limited");

    getTournaments.mockResolvedValue(tournaments(BATCH_SIZE * 2).slice(BATCH_SIZE));
    getTournamentDecks.mockImplementation(async (t: { id: string }) => [deck(`${t.id}-player`)]);
    await downloadDecks();

    const ids = readDecks(path.join(dataDir, "decks")).map((entry) => entry.id);
    expect(ids).toHaveLength(BATCH_SIZE * 2);
    expect(new Set(ids).size).toBe(BATCH_SIZE * 2);
    expect(processedIds()).toHaveLength(BATCH_SIZE * 2);
  });

  it("records a tournament that produced no usable decks as processed", async () => {
    getTournaments.mockResolvedValue(tournaments(2));
    getTournamentDecks.mockImplementation(async (t: { id: string }) =>
      t.id === "t1" ? [] : [deck(`${t.id}-player`)]
    );

    await downloadDecks();

    expect(processedIds()).toEqual(["t0", "t1"]);
    expect(readDecks(path.join(dataDir, "decks")).map((entry) => entry.id)).toEqual(["t0-player"]);
  });

  it("refuses to run when the deck store exists without the processed list", async () => {
    getTournaments.mockResolvedValue(tournaments(1));
    await downloadDecks();
    fs.rmSync(path.join(dataDir, "processed-tournaments.json"));
    getTournaments.mockResolvedValue(tournaments(2));

    await expect(downloadDecks()).rejects.toThrow("must exist together");
    expect(Object.keys(readManifest(path.join(dataDir, "decks")).shards)).toHaveLength(1);
  });

  it("refuses to run when a processed list exists without a deck store", async () => {
    fs.writeFileSync(path.join(dataDir, "processed-tournaments.json"), JSON.stringify([{ id: "old" }]));
    getTournaments.mockResolvedValue(tournaments(1));

    await expect(downloadDecks()).rejects.toThrow("must exist together");
    expect(getTournamentDecks).not.toHaveBeenCalled();
  });

  it("writes nothing when there is nothing new", async () => {
    getTournaments.mockResolvedValue([]);

    await downloadDecks();

    expect(fs.existsSync(path.join(dataDir, "processed-tournaments.json"))).toBe(false);
    expect(Object.keys(readManifest(path.join(dataDir, "decks")).shards)).toEqual([]);
  });

  describe("readProcessed", () => {
    const storeDir = () => path.join(dataDir, "decks");

    const writeManifest = (shards: Record<string, unknown>): void => {
      fs.mkdirSync(storeDir(), { recursive: true });
      fs.writeFileSync(path.join(storeDir(), "manifest.json"), JSON.stringify({ schema: 1, shards }));
    };

    const writeProcessed = (entries: { id: string }[]): void =>
      fs.writeFileSync(path.join(dataDir, "processed-tournaments.json"), JSON.stringify(entries));

    it("returns an empty list for a fresh directory", () => {
      expect(readProcessed()).toEqual([]);
    });

    it("refuses a store holding shards when the processed list is missing", () => {
      writeManifest({ "2026-09": { file: "2026-09.ndjson", count: 1, minDate: DATE, maxDate: DATE } });

      expect(() => readProcessed()).toThrow("must exist together");
    });

    it("refuses a processed list with entries when the store is missing", () => {
      writeProcessed([{ id: "t0" }]);

      expect(() => readProcessed()).toThrow("must exist together");
    });

    it("accepts a processed list when the manifest holds no shards", () => {
      writeManifest({});
      writeProcessed([{ id: "t0" }]);

      expect(readProcessed()).toEqual([{ id: "t0" }]);
    });
  });
});
