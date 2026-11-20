import fs from "fs";
import os from "os";
import path from "path";
import { vi } from "vitest";
import { BATCH_SIZE, downloadDecks, parseArgs, parseSince, readProcessed } from "../download-decks";
import { EXPANSION_RELEASE_DATE } from "../settings";
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

  it("passes the since date to the listing and records only what it returns", async () => {
    const since = new Date("2026-09-01T00:00:00.000Z");
    getTournaments.mockResolvedValue(tournaments(2));

    await downloadDecks({ since });

    expect(getTournaments).toHaveBeenCalledWith({ since });
    expect(processedIds()).toEqual(["t0", "t1"]);
  });

  it("lists without a date filter by default", async () => {
    getTournaments.mockResolvedValue([]);
    await downloadDecks();
    expect(getTournaments.mock.calls[0][0]?.since).toBeUndefined();
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

  it("refuses a batch when another run holds the store lock", async () => {
    const holder = process.ppid;
    expect(holder).not.toBe(process.pid);
    expect(() => process.kill(holder, 0)).not.toThrow();
    getTournaments.mockResolvedValue(tournaments(1));
    const store = path.join(dataDir, "decks");
    fs.writeFileSync(`${store}.lock`, String(holder));

    await expect(downloadDecks()).rejects.toThrow(/is held by process/);

    // The batch downloads before it takes the lock, and then writes nothing.
    expect(getTournamentDecks).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(path.join(dataDir, "processed-tournaments.json"))).toBe(false);
    expect(Object.keys(readManifest(store).shards)).toEqual([]);
  });

  describe("two runs at once", () => {
    const gateDownloads = () => {
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      getTournamentDecks.mockImplementation(async (t: { id: string }) => {
        await gate;
        return [deck(`${t.id}-player`)];
      });
      return release;
    };

    const startBoth = async (first: ReturnType<typeof tournaments>, second: ReturnType<typeof tournaments>) => {
      getTournaments.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
      const release = gateDownloads();
      const runs = [downloadDecks(), downloadDecks()];
      await vi.waitFor(() => expect(getTournamentDecks).toHaveBeenCalledTimes(first.length + second.length));
      release();
      return runs;
    };

    it("keeps the tournaments of both runs in the processed list", async () => {
      const runs = await startBoth([tournament(0), tournament(1)], [tournament(2), tournament(3)]);

      await Promise.all(runs);

      expect(processedIds().sort()).toEqual(["t0", "t1", "t2", "t3"]);
      expect(
        readDecks(path.join(dataDir, "decks"))
          .map((entry) => entry.id)
          .sort()
      ).toEqual(["t0-player", "t1-player", "t2-player", "t3-player"]);
    });

    it("skips a tournament that the other run recorded first", async () => {
      const runs = await startBoth([tournament(0), tournament(1)], [tournament(1), tournament(2)]);

      await Promise.all(runs);

      expect(processedIds().sort()).toEqual(["t0", "t1", "t2"]);
      const ids = readDecks(path.join(dataDir, "decks")).map((entry) => entry.id);
      expect(ids.sort()).toEqual(["t0-player", "t1-player", "t2-player"]);
      expect(verifyStore(path.join(dataDir, "decks"), { placement: true })).toEqual([]);
    });

    it("lets a later run resume cleanly after the overlap", async () => {
      const runs = await startBoth([tournament(0)], [tournament(0), tournament(1)]);
      await Promise.all(runs);
      vi.clearAllMocks();
      getTournaments.mockResolvedValue([tournament(2)]);
      getTournamentDecks.mockImplementation(async (t: { id: string }) => [deck(`${t.id}-player`)]);

      await downloadDecks();

      expect(processedIds().sort()).toEqual(["t0", "t1", "t2"]);
    });
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

describe("parseSince", () => {
  it("reads a calendar day as the start of that UTC day", () => {
    expect(parseSince("2026-10-29").toISOString()).toBe("2026-10-29T00:00:00.000Z");
  });

  it("reads release as the expansion release date", () => {
    expect(parseSince("release")).toBe(EXPANSION_RELEASE_DATE);
  });

  it.each(["", "yesterday", "2026-13-01", "2026-02-30", "2026-1-5", "2026-10-29T10:00:00Z", "Release"])(
    "rejects %j",
    (value) => {
      expect(() => parseSince(value)).toThrow(/Invalid --since value/);
    }
  );
});

describe("parseArgs", () => {
  it("returns no filter without the flag", () => {
    expect(parseArgs([])).toEqual({});
  });

  it("accepts the value after the flag or joined with =", () => {
    expect(parseArgs(["--since", "2026-10-29"]).since?.toISOString()).toBe("2026-10-29T00:00:00.000Z");
    expect(parseArgs(["--since=release"]).since).toBe(EXPANSION_RELEASE_DATE);
  });

  it("rejects a flag with no value or a bad one", () => {
    expect(() => parseArgs(["--since"])).toThrow("Missing value for --since");
    expect(() => parseArgs(["--since", "soon"])).toThrow(/Invalid --since value/);
  });
});
