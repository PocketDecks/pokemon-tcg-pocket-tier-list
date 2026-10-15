import fs from "fs";
import os from "os";
import path from "path";
import { vi } from "vitest";
import { planDeckWrites, verifyStore } from "../utils/deck-store";
import { Deck } from "../utils/types";
import { purgeNonStandardTournaments } from "../../scripts/purge-nonstandard-tournaments";

// The script loads the root .env on import; these tests stub fetch instead.
vi.mock("../load-env-side-effect", () => ({}));

const STANDARD_DATE = "2026-09-01T10:00:00.000Z";
const CUSTOM_DATE = "2026-09-02T10:00:00.000Z";

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

// Every file in the store, keyed by name, so a dry run can be proved byte-identical.
const readTree = (dir: string): Record<string, string> => {
  const tree: Record<string, string> = {};
  for (const name of fs.readdirSync(dir).sort()) {
    tree[name] = fs.readFileSync(path.join(dir, name), "utf8");
  }
  return tree;
};

// A request answers by URL; an unrouted URL fails, so no request leaves the test.
// The optional hook runs before the response, so a test can tamper with the
// store while a request is in flight.
const respondByUrl = (routes: Record<string, unknown>, onRequest?: (url: string) => void) =>
  vi.fn().mockImplementation((url: string) => {
    onRequest?.(url);
    const key = Object.keys(routes).find((route) => url.includes(route));
    if (key === undefined) {
      return Promise.resolve({
        ok: false,
        status: 404,
        statusText: "Not Found",
        headers: new Headers(),
        json: () => Promise.resolve({}),
      });
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers(),
      json: () => Promise.resolve(routes[key]),
    });
  });

const listing = [
  { id: "std", date: STANDARD_DATE, name: "Standard Cup", format: null },
  { id: "cus", date: CUSTOM_DATE, name: "Throwback", format: "CUSTOM" },
];

const standardStore = (dir: string) =>
  commit(
    planDeckWrites(dir, [
      makeDeck("std-alice", STANDARD_DATE),
      makeDeck("std-bob", STANDARD_DATE),
      makeDeck("cus-carol", CUSTOM_DATE),
      makeDeck("cus-dave", CUSTOM_DATE),
    ])
  );

const customOnlyStore = (dir: string) =>
  commit(
    planDeckWrites(dir, [
      makeDeck("cus-carol", CUSTOM_DATE),
      makeDeck("cus-dave", CUSTOM_DATE),
    ])
  );

const stubFetch = (details: Record<string, unknown> = {}) =>
  respondByUrl({
    "/tournaments/std/details": details.std ?? {},
    "/tournaments/cus/details": details.cus ?? {},
    "/tournaments?limit=": listing,
  });

describe("purge-nonstandard-tournaments", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "purge-formats-"));
    vi.stubEnv("LIMITLESS_API_KEY", "test-key");
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(`${dir}.lock`, { force: true });
  });

  it("lists the non-standard tournament on a dry run and leaves every file byte-identical", async () => {
    standardStore(dir);
    const before = readTree(dir);
    global.fetch = stubFetch();

    const removed = await purgeNonStandardTournaments({ dir });

    expect(removed.map((entry) => entry.id)).toEqual(["cus"]);
    expect(removed[0]).toEqual(
      expect.objectContaining({
        id: "cus",
        date: CUSTOM_DATE,
        name: "Throwback",
        reason: "format CUSTOM",
        deckCount: 2,
      })
    );
    const printed = vi.mocked(console.log).mock.calls.map((call) => call[0]).join("\n");
    expect(printed).toContain("cus");
    expect(printed).toContain("format CUSTOM");
    expect(printed).toContain("(2 decks)");
    expect(printed).toContain("total 1 tournaments, 2 decks");
    expect(readTree(dir)).toEqual(before);
  });

  it("reads the reason for a rejected listing without fetching its details", async () => {
    standardStore(dir);
    const fetchMock = stubFetch();
    global.fetch = fetchMock;

    const removed = await purgeNonStandardTournaments({ dir });

    expect(removed).toEqual([
      expect.objectContaining({ id: "cus", reason: "format CUSTOM" }),
    ]);
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes("/tournaments/cus/details"))).toBe(false);
  });

  it("reads the reason from the details when the listing omits the tournament", async () => {
    commit(planDeckWrites(dir, [makeDeck("solo-alice", CUSTOM_DATE)]));
    global.fetch = respondByUrl({
      "/tournaments/solo/details": { specialRules: ["MONOTYPE"] },
      "/tournaments?limit=": listing,
    });

    const removed = await purgeNonStandardTournaments({ dir });

    expect(removed).toEqual([
      expect.objectContaining({ id: "solo", reason: "special rules MONOTYPE" }),
    ]);
  });

  it("removes only the non-standard decks on apply and leaves a store that verifies", async () => {
    standardStore(dir);
    global.fetch = stubFetch();

    await purgeNonStandardTournaments({ dir, apply: true });

    const remaining = fs
      .readFileSync(path.join(dir, "b4a.ndjson"), "utf8")
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line).id);
    expect(remaining.sort()).toEqual(["std-alice", "std-bob"]);

    const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
    expect(manifest.shards.b4a).toEqual({
      file: "b4a.ndjson",
      count: 2,
      minDate: STANDARD_DATE,
      maxDate: STANDARD_DATE,
    });
    expect(verifyStore(dir, { placement: true })).toEqual([]);
  });

  it("refuses and writes nothing when a shard would be emptied", async () => {
    customOnlyStore(dir);
    const before = readTree(dir);
    global.fetch = stubFetch();

    await expect(purgeNonStandardTournaments({ dir, apply: true })).rejects.toThrow(
      /would be emptied/
    );
    expect(readTree(dir)).toEqual(before);
  });

  it("refuses to write when the store changes while the purge is reading", async () => {
    standardStore(dir);
    const shard = path.join(dir, "b4a.ndjson");
    const manifestFile = path.join(dir, "manifest.json");
    const tampered =
      fs.readFileSync(shard, "utf8") + `${JSON.stringify(makeDeck("std-erin", STANDARD_DATE))}\n`;
    const manifestBefore = fs.readFileSync(manifestFile, "utf8");
    global.fetch = respondByUrl(
      {
        "/tournaments/std/details": {},
        "/tournaments/cus/details": {},
        "/tournaments?limit=": listing,
      },
      (url) => {
        if (url.includes("/tournaments/std/details")) fs.writeFileSync(shard, tampered);
      }
    );

    await expect(purgeNonStandardTournaments({ dir, apply: true })).rejects.toThrow(
      /b4a\.ndjson changed.*nothing written/
    );
    expect(fs.readFileSync(shard, "utf8")).toBe(tampered);
    expect(fs.readFileSync(manifestFile, "utf8")).toBe(manifestBefore);
  });

  it("refuses before the first request when another run holds the store lock", async () => {
    standardStore(dir);
    const before = readTree(dir);
    fs.writeFileSync(`${dir}.lock`, String(process.pid));
    const fetchMock = stubFetch();
    global.fetch = fetchMock;

    await expect(purgeNonStandardTournaments({ dir, apply: true })).rejects.toThrow(
      /is held by process/
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(readTree(dir)).toEqual(before);
  });

  it("refuses the apply path when another run holds the store lock", async () => {
    standardStore(dir);
    const before = readTree(dir);
    const lockFile = `${dir}.lock`;
    global.fetch = respondByUrl(
      {
        "/tournaments/std/details": {},
        "/tournaments/cus/details": {},
        "/tournaments?limit=": listing,
      },
      (url) => {
        // A download that reaches its write phase mid-purge holds the lock the
        // purge needs for its own compare and write.
        if (url.includes("/tournaments/std/details")) {
          fs.writeFileSync(lockFile, String(process.pid));
        }
      }
    );

    await expect(purgeNonStandardTournaments({ dir, apply: true })).rejects.toThrow(
      /is held by process/
    );
    expect(readTree(dir)).toEqual(before);
    // The purge never held the lock, so the holder's lock file survives.
    expect(fs.readFileSync(lockFile, "utf8")).toBe(String(process.pid));
  });
});
