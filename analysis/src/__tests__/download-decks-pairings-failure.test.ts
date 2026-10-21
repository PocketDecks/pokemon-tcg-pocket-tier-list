import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { downloadDecks } from "../download-decks";
import { readDecks } from "../utils/deck-store";
import { LimitlessError } from "../utils/limitless-client";

const DATE = "2026-10-10T00:00:00.000Z";

const listing = (id: string) => ({
  id,
  date: DATE,
  players: 64,
  format: "STANDARD",
});

const standings = [
  {
    player: "p1",
    decklist: {
      pokemon: [{ name: "Pikachu ex", set: "A1", number: "96", count: 2 }],
      trainer: [],
    },
    record: { wins: 6, losses: 2 },
  },
];

const STATUS_TEXT: Record<number, string> = {
  200: "OK",
  401: "Unauthorized",
  429: "Too Many Requests",
  503: "Service Unavailable",
};

const respond = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: STATUS_TEXT[status] ?? "Unknown",
  headers: new Headers(),
  json: async () => body,
});

const route =
  (ids: string[], failPairingsFor: string | null, failStatus = 503) =>
  async (input: string): Promise<unknown> => {
    const url = String(input);
    if (url.includes("/pairings")) {
      const id = /tournaments\/([^/]+)\/pairings/.exec(url)?.[1] ?? "";
      return id === failPairingsFor ? respond(failStatus, []) : respond(200, []);
    }
    if (url.includes("/details")) return respond(200, {});
    if (url.includes("/standings")) return respond(200, standings);
    if (url.includes("/tournaments")) return respond(200, ids.map(listing));
    throw new Error(`unexpected request ${url}`);
  };

describe("downloadDecks when a pairings request fails", () => {
  let dataDir: string;

  const processedIds = (): string[] =>
    (
      JSON.parse(
        fs.readFileSync(path.join(dataDir, "processed-tournaments.json"), "utf8")
      ) as { id: string }[]
    ).map((entry) => entry.id);

  const settle = async (run: Promise<unknown>): Promise<unknown> => {
    const failure = run.catch((error) => error);
    await vi.advanceTimersByTimeAsync(4000);
    return failure;
  };

  const snapshot = (): Record<string, string> => {
    const dir = path.join(dataDir, "decks");
    const files = [
      path.join(dataDir, "processed-tournaments.json"),
      ...fs.readdirSync(dir).map((file) => path.join(dir, file)),
    ];
    return Object.fromEntries(
      files.map((file) => [
        path.relative(dataDir, file),
        fs.readFileSync(file, "utf8"),
      ])
    );
  };

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "download-pairings-"));
    vi.stubEnv("ANALYSIS_DATA_DIR", dataDir);
    vi.stubEnv("DECKS_DIR", "");
    vi.stubEnv("LIMITLESS_API_KEY", "test-key");
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it.each([401, 429, 503])(
    "fails the run and writes nothing for a %i pairings response",
    async (status) => {
      global.fetch = route(["t1"], "t1", status) as unknown as typeof fetch;
      vi.useFakeTimers();

      const error = await settle(downloadDecks());
      vi.useRealTimers();

      expect(error).toBeInstanceOf(LimitlessError);
      expect((error as LimitlessError).status).toBe(status);
      expect((error as Error).message).toContain(STATUS_TEXT[status]);
      expect(fs.existsSync(path.join(dataDir, "processed-tournaments.json"))).toBe(
        false
      );
      expect(fs.readdirSync(path.join(dataDir, "decks"))).toEqual([]);
    }
  );

  it("leaves the tournament retryable", async () => {
    global.fetch = route(["t1"], null) as unknown as typeof fetch;
    await downloadDecks();
    expect(processedIds()).toEqual(["t1"]);
    const beforeFailure = snapshot();

    global.fetch = route(["t1", "t2"], "t2") as unknown as typeof fetch;
    vi.useFakeTimers();
    const error = await settle(downloadDecks());
    vi.useRealTimers();

    expect(error).toBeInstanceOf(LimitlessError);
    expect(snapshot()).toEqual(beforeFailure);
    expect(processedIds()).toEqual(["t1"]);
    expect(readDecks(path.join(dataDir, "decks")).map((deck) => deck.id)).toEqual([
      "t1-p1",
    ]);

    global.fetch = route(["t1", "t2"], null) as unknown as typeof fetch;
    await downloadDecks();

    expect(processedIds()).toEqual(["t1", "t2"]);
    expect(readDecks(path.join(dataDir, "decks")).map((deck) => deck.id)).toEqual([
      "t1-p1",
      "t2-p1",
    ]);
  });
});
