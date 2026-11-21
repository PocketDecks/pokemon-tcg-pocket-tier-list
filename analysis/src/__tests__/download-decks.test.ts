import fs from "fs";
import os from "os";
import path from "path";
import { vi } from "vitest";
import { BATCH_SIZE, CONCURRENCY, downloadDecks, lockDelays, parseArgs, parseSince, readProcessed } from "../download-decks";
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
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
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

  it("refuses to start when another run holds the store lock", async () => {
    const holder = process.ppid;
    expect(holder).not.toBe(process.pid);
    expect(() => process.kill(holder, 0)).not.toThrow();
    getTournaments.mockResolvedValue(tournaments(1));
    const store = path.join(dataDir, "decks");
    fs.writeFileSync(`${store}.lock`, String(holder));

    await expect(downloadDecks({ lockWait: { retries: 1, delayMs: 1 } })).rejects.toThrow(/is held by process/);

    expect(getTournamentDecks).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(dataDir, "processed-tournaments.json"))).toBe(false);
    expect(Object.keys(readManifest(store).shards)).toEqual([]);
  });

  describe("waiting for the store lock", () => {
    const lockFile = () => `${path.join(dataDir, "decks")}.lock`;

    it("retries until the other run releases the lock", async () => {
      const file = lockFile();
      fs.writeFileSync(file, String(process.ppid));
      getTournaments.mockResolvedValue(tournaments(2));
      const release = setTimeout(() => fs.rmSync(file, { force: true }), 40);

      try {
        await downloadDecks({ lockWait: { retries: 12, delayMs: 5 } });
      } finally {
        clearTimeout(release);
      }

      expect(processedIds()).toEqual(["t0", "t1"]);
      expect(readDecks(path.join(dataDir, "decks"))).toHaveLength(2);
    });

    it("says once that it is waiting for the lock", async () => {
      fs.writeFileSync(lockFile(), String(process.ppid));
      getTournaments.mockResolvedValue(tournaments(1));

      await expect(downloadDecks({ lockWait: { retries: 3, delayMs: 1 } })).rejects.toThrow(/is held by process/);

      expect(console.warn).toHaveBeenCalledTimes(1);
      expect(console.warn).toHaveBeenCalledWith(expect.stringMatching(/held by another run; waiting up to \d+s/));
    });

    it("stays quiet when the lock is free", async () => {
      getTournaments.mockResolvedValue(tournaments(1));

      await downloadDecks({ lockWait: { retries: 3, delayMs: 1 } });

      expect(console.warn).not.toHaveBeenCalled();
    });

    it("holds back every download until the lock is free", async () => {
      fs.writeFileSync(lockFile(), String(process.ppid));
      getTournaments.mockResolvedValue(tournaments(1));
      const file = lockFile();
      const release = setTimeout(() => fs.rmSync(file, { force: true }), 80);

      try {
        const run = downloadDecks({ lockWait: { retries: 12, delayMs: 5 } });
        await new Promise((resolve) => setTimeout(resolve, 40));
        expect(getTournamentDecks).not.toHaveBeenCalled();
        await run;
      } finally {
        clearTimeout(release);
      }

      expect(getTournamentDecks).toHaveBeenCalledTimes(1);
      expect(processedIds()).toEqual(["t0"]);
    });

    it("looks for staging files only while it holds the lock", async () => {
      getTournaments.mockResolvedValue(tournaments(1));
      let open: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        open = resolve;
      });
      getTournamentDecks.mockImplementation(async (t: { id: string }) => {
        await gate;
        return [deck(`${t.id}-player`)];
      });
      const lock = lockFile();
      const staging = path.join(dataDir, "processed-tournaments.json.tmp");
      const run = downloadDecks({ lockWait: { retries: 12, delayMs: 5 } });
      await vi.waitFor(() => expect(getTournamentDecks).toHaveBeenCalledTimes(1));
      fs.writeFileSync(lock, String(process.ppid));
      fs.writeFileSync(staging, "");
      const release = setTimeout(() => {
        fs.rmSync(lock, { force: true });
        fs.rmSync(staging, { force: true });
      }, 60);

      try {
        open();
        await run;
      } finally {
        clearTimeout(release);
      }

      expect(processedIds()).toEqual(["t0"]);
    });

    it("gives up with the lock error once the attempts run out", async () => {
      fs.writeFileSync(lockFile(), String(process.ppid));
      getTournaments.mockResolvedValue(tournaments(1));
      const timer = vi.spyOn(globalThis, "setTimeout");

      await expect(downloadDecks({ lockWait: { retries: 3, delayMs: 1 } })).rejects.toThrow(/is held by process/);

      const delays = timer.mock.calls.map(([, delay]) => delay).filter((delay) => [1, 2, 4, 8].includes(delay as number));
      expect(delays).toEqual([1, 2, 4]);
      expect(fs.existsSync(path.join(dataDir, "processed-tournaments.json"))).toBe(false);
    });
  });

  it("leaves the store untouched when every tournament in a batch is already recorded", async () => {
    getTournaments.mockResolvedValue(tournaments(2));
    await downloadDecks();
    const files = [path.join(dataDir, "processed-tournaments.json"), path.join(dataDir, "decks", "manifest.json")];
    const before = files.map((file) => fs.statSync(file).ino);

    await downloadDecks();

    expect(files.map((file) => fs.statSync(file).ino)).toEqual(before);
    expect(processedIds()).toEqual(["t0", "t1"]);
  });

  describe("after an interrupted write", () => {
    const seedOrphan = async () => {
      getTournaments.mockResolvedValue(tournaments(1));
      await downloadDecks();
      fs.writeFileSync(path.join(dataDir, "processed-tournaments.json"), "[]");
    };

    it.each([
      [
        "a staged processed list",
        () => path.join(dataDir, "processed-tournaments.json.tmp"),
        /did not finish: restore each \.bak over its target, remove targets that have a \.created marker/,
      ],
      ["a shard backup", () => path.join(dataDir, "decks", "manifest.json.bak"), /finished: delete them/],
    ])("names %s and the way to recover instead of reporting a duplicate deck", async (_label, stagingFile, advice) => {
      await seedOrphan();
      fs.writeFileSync(stagingFile(), "");
      getTournaments.mockResolvedValue(tournaments(1));

      const error = await downloadDecks().catch((thrown: Error) => thrown);

      expect((error as Error).message).toMatch(/interrupted write left staging files/);
      expect((error as Error).message).toMatch(advice);
      expect((error as Error).message).toMatch(/store:verify/);
      expect((error as Error).message).not.toMatch(/already exists/);
      expect(processedIds()).toEqual([]);
    });
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
      const inFlight = Math.min(first.length, CONCURRENCY) + Math.min(second.length, CONCURRENCY);
      await Promise.race([
        vi.waitFor(() => expect(getTournamentDecks).toHaveBeenCalledTimes(inFlight)),
        ...runs,
      ]);
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

    it("keeps a write from the other run that lands between two batches of one run", async () => {
      const first = tournaments(BATCH_SIZE + 2);
      const second = [tournament(BATCH_SIZE), tournament(BATCH_SIZE + 3)];
      const secondBatchOfFirst = first.slice(BATCH_SIZE);
      let releaseFirst: () => void = () => undefined;
      let releaseSecond: () => void = () => undefined;
      const firstGate = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      const secondGate = new Promise<void>((resolve) => {
        releaseSecond = resolve;
      });
      getTournaments.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
      getTournamentDecks.mockImplementation(async (t: { id: string }) => {
        if (second.includes(t as (typeof second)[number])) await secondGate;
        if (secondBatchOfFirst.includes(t as (typeof first)[number])) await firstGate;
        return [deck(`${t.id}-player`)];
      });
      const runs = [downloadDecks(), downloadDecks()];

      await Promise.race([vi.waitFor(() => expect(processedIds()).toHaveLength(BATCH_SIZE)), ...runs]);
      releaseSecond();
      await runs[1];
      releaseFirst();
      await runs[0];

      const expected = [...Array.from({ length: BATCH_SIZE + 2 }, (_, n) => `t${n}`), `t${BATCH_SIZE + 3}`];
      expect(processedIds().sort()).toEqual([...expected].sort());
      expect(
        readDecks(path.join(dataDir, "decks"))
          .map((entry) => entry.id)
          .sort()
      ).toEqual(expected.map((id) => `${id}-player`).sort());
      expect(verifyStore(path.join(dataDir, "decks"), { placement: true })).toEqual([]);
    });

    it("lets a later run resume cleanly after the overlap", async () => {
      const known = [tournament(0), tournament(1), tournament(2)];
      const runs = await startBoth([known[0]], [tournament(0), known[1]]);
      await Promise.all(runs);
      vi.clearAllMocks();
      getTournaments.mockImplementation(async () => known.filter((t) => !processedIds().includes(t.id)));
      getTournamentDecks.mockImplementation(async (t: { id: string }) => [deck(`${t.id}-player`)]);

      await downloadDecks();

      expect(getTournamentDecks).toHaveBeenCalledTimes(1);
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

describe("lockDelays", () => {
  it("doubles from the base delay and stops at the cap", () => {
    expect(lockDelays({ retries: 8, delayMs: 250 })).toEqual([250, 500, 1000, 2000, 4000, 5000, 5000, 5000]);
  });

  it("gives one delay per retry", () => {
    expect(lockDelays({ retries: 0, delayMs: 5 })).toEqual([]);
    expect(lockDelays({ retries: 3, delayMs: 1 })).toEqual([1, 2, 4]);
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
