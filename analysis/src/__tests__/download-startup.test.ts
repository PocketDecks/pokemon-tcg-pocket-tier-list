import { fork, ChildProcess } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { vi } from "vitest";
import { downloadDecks } from "../download-decks";
import { readDecks } from "../utils/deck-store";

const { getTournamentDecks } = vi.hoisted(() => ({
  getTournamentDecks: vi.fn(),
}));

vi.mock("../utils/get-tournament-decks", () => ({ default: getTournamentDecks }));

const DATE = "2026-11-02T10:00:00.000Z";

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

const response = (body: unknown) => ({
  ok: true,
  status: 200,
  statusText: "OK",
  headers: new Headers(),
  json: () => Promise.resolve(body),
});

const waitForMessage = (child: ChildProcess, expected: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout);
      child.off("message", onMessage);
      child.off("error", onError);
    };
    const onMessage = (message: unknown) => {
      if (message !== expected) return;
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for writer message ${expected}`));
    }, 5000);
    child.on("message", onMessage);
    child.on("error", onError);
  });

describe("downloadDecks startup", () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "download-startup-"));
    vi.clearAllMocks();
    vi.stubEnv("ANALYSIS_DATA_DIR", dataDir);
    vi.stubEnv("DECKS_DIR", "");
    vi.stubEnv("LIMITLESS_API_KEY", "test-key");
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    getTournamentDecks.mockImplementation(async (tournament: { id: string }) => [deck(`${tournament.id}-player`)]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it("reports checkpoint staging before fetching an empty listing", async () => {
    const store = path.join(dataDir, "decks");
    const manifest = path.join(store, "manifest.json");
    const processed = path.join(dataDir, "processed-tournaments.json");
    fs.mkdirSync(store, { recursive: true });
    fs.writeFileSync(manifest, JSON.stringify({ schema: 1, shards: {} }));
    fs.writeFileSync(processed, "[]");
    fs.writeFileSync(`${processed}.tmp`, "[");
    const fetchMock = vi.fn().mockResolvedValue(response([]));
    vi.stubGlobal("fetch", fetchMock);

    const error = await downloadDecks().catch((thrown: Error) => thrown);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(`${processed}.tmp`);
    expect((error as Error).message).toContain("commit completion is unknown");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fs.readFileSync(manifest, "utf8")).toBe(JSON.stringify({ schema: 1, shards: {} }));
    expect(fs.readFileSync(processed, "utf8")).toBe("[]");
    expect(fs.readFileSync(`${processed}.tmp`, "utf8")).toBe("[");
  });

  it("reports store staging before validating a missing checkpoint", async () => {
    const store = path.join(dataDir, "decks");
    const manifest = path.join(store, "manifest.json");
    fs.mkdirSync(store, { recursive: true });
    fs.writeFileSync(manifest, JSON.stringify({ schema: 1, shards: {} }));
    fs.writeFileSync(`${manifest}.bak`, "old manifest");
    const fetchMock = vi.fn().mockResolvedValue(response([]));
    vi.stubGlobal("fetch", fetchMock);

    const error = await downloadDecks().catch((thrown: Error) => thrown);

    expect((error as Error).message).toContain(`${manifest}.bak`);
    expect((error as Error).message).toContain("commit completion is unknown");
    expect((error as Error).message).not.toContain("must exist together");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fs.readFileSync(manifest, "utf8")).toBe(JSON.stringify({ schema: 1, shards: {} }));
    expect(fs.readFileSync(`${manifest}.bak`, "utf8")).toBe("old manifest");
    expect(fs.existsSync(path.join(dataDir, "processed-tournaments.json"))).toBe(false);
  });

  it("waits for the checkpoint writer before filtering the real listing", async () => {
    const store = path.join(dataDir, "decks");
    const manifest = path.join(store, "manifest.json");
    const processed = path.join(dataDir, "processed-tournaments.json");
    const lock = `${store}.lock`;
    fs.mkdirSync(store, { recursive: true });
    fs.writeFileSync(manifest, JSON.stringify({ schema: 1, shards: {} }));
    fs.writeFileSync(processed, JSON.stringify([{ id: "known", date: DATE }]));
    const snapshot = JSON.stringify([{ id: "known", date: DATE }]);
    const writer = fork(path.join(__dirname, "fixtures", "hold-processed-write.cjs"), [], {
      env: {
        ...process.env,
        STORE_LOCK: lock,
        PROCESSED_FILE: processed,
        PROCESSED_SNAPSHOT: snapshot,
      },
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    });
    const ready = waitForMessage(writer, "ready");
    const fetchMock = vi.fn().mockResolvedValue(
      response([
        { id: "known", date: DATE, players: 32, format: null },
        { id: "fresh", date: DATE, players: 32, format: null },
      ])
    );
    vi.stubGlobal("fetch", fetchMock);

    try {
      await ready;
      let lockAttempted = false;
      vi.spyOn(console, "warn").mockImplementation((message?: unknown) => {
        if (String(message).includes("store lock is busy")) lockAttempted = true;
      });
      let failure: unknown;
      const run = downloadDecks({ lockWait: { retries: 12, delayMs: 2 } }).catch((error: unknown) => {
        failure = error;
      });
      const reachedLock = await Promise.race([
        new Promise<"lock">((resolve) => {
          const poll = () => {
            if (lockAttempted) resolve("lock");
            else setTimeout(poll, 1);
          };
          poll();
        }),
        run.then(() => "settled" as const),
        new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 2000)),
      ]);
      const requestsBeforeRelease = fetchMock.mock.calls.length;
      const released = waitForMessage(writer, "released");
      writer.send("release");
      await released;
      await run;

      expect(reachedLock).toBe("lock");
      expect(requestsBeforeRelease).toBe(0);
      expect(failure).toBeUndefined();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(getTournamentDecks).toHaveBeenCalledTimes(1);
      expect(getTournamentDecks).toHaveBeenCalledWith(expect.objectContaining({ id: "fresh" }));
      expect(
        JSON.parse(fs.readFileSync(processed, "utf8")).map((entry: { id: string }) => entry.id)
      ).toEqual(["known", "fresh"]);
      expect(readDecks(store).map((entry) => entry.id)).toEqual(["fresh-player"]);
    } finally {
      if (writer.exitCode === null) writer.kill();
    }
  });
});
