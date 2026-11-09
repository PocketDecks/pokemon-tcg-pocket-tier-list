import path from "node:path";
import { vi } from "vitest";
import { Deck } from "../utils/types";

const { writeArtefacts, stageOgImages, getDecks, withStoreLock, commit, discard, mkdirSync, mainVersion, PREMIUM_TEST_DIR, PREVIOUS_TEST_DIR, DECKS_TEST_DIR } = vi.hoisted(() => {
  const base = require("node:path").join(require("node:os").tmpdir(), "get-best-decks-premium");
  return ({
  mkdirSync: vi.fn(),
  PREMIUM_TEST_DIR: require("node:path").join(base, "out"),
  PREVIOUS_TEST_DIR: require("node:path").join(base, "premium-previous"),
  DECKS_TEST_DIR: `${require("node:os").tmpdir()}/get-best-decks-store`,
  writeArtefacts: vi.fn(),
  stageOgImages: vi.fn(),
  getDecks: vi.fn(),
  withStoreLock: vi.fn((_dir: string, fn: () => unknown) => fn()),
  commit: vi.fn(),
  discard: vi.fn(),
  mainVersion: vi.fn(() => undefined as string | undefined),
  });
});

vi.mock("../load-env-side-effect", () => ({}));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  mkdirSync.mockImplementation((...args: Parameters<typeof actual.mkdirSync>) =>
    actual.mkdirSync(...args)
  );
  return { ...actual, default: { ...actual, mkdirSync }, mkdirSync };
});
vi.mock("../utils/premium-artefacts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../utils/premium-artefacts")>();
  return {
    ...actual,
    PREMIUM_DIR: PREMIUM_TEST_DIR,
    previousPremiumDir: () => PREVIOUS_TEST_DIR,
  };
});
vi.mock("../utils/premium-files", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../utils/premium-files")>();
  return { ...actual, readPremiumVersionAtRef: mainVersion, resolveCanonicalMainRef: vi.fn(() => "refs/remotes/pocketdecks/main") };
});
vi.mock("../utils/write-artifacts", () => ({ writeArtefacts }));
vi.mock("../utils/data-paths", () => ({ decksDir: () => DECKS_TEST_DIR }));
vi.mock("../utils/store-lock", () => ({ withStoreLock }));
vi.mock("../utils/generate-og-images", () => ({ stageOgImages }));
vi.mock("../utils/get-decks", () => ({ default: getDecks }));
vi.mock("../utils/assert-publishable", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../utils/assert-publishable")>();
  return {
    ...actual,
    assertPublishable: vi.fn(actual.assertPublishable),
    readPreviousArchetypeCount: vi.fn(() => null),
  };
});
// EXPANSION_RELEASE_DATE comes from the installed card package, so a package
// bump would move the day count the gate receives. Pin the date here so the
// expectation is derived from this file.
vi.mock("../settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../settings")>();
  return { ...actual, EXPANSION_RELEASE_DATE: MOCKED_RELEASE_DATE };
});

import { run } from "../get-best-decks";
import { freeDeckNames } from "../../../src/app/free-tier";
import { UNMATCHED_DECK } from "../utils/get-deck-name";
import { assertPublishable, daysOfDataSince, readPreviousArchetypeCount } from "../utils/assert-publishable";
import { EXPANSION_RELEASE_DATE } from "../settings";
import {
  loadPremiumSnapshotForVersion,
  PREMIUM_ARTEFACT_NAMES,
  premiumVersion,
  renderDataVersion,
  snapshotPremiumVersion,
} from "../utils/premium-artefacts";
import { readPremiumVersionAtRef, resolveCanonicalMainRef } from "../utils/premium-files";

const { MOCKED_RELEASE_DATE } = vi.hoisted(() => ({
  MOCKED_RELEASE_DATE: new Date("2026-08-20T00:00:00.000Z"),
}));

const NOW = new Date("2026-09-24T12:00:00.000Z");
const DECK_DATE = "2026-09-23T02:00:00.000Z";
const ARCHETYPES = 40;
const OPPONENTS = 30;
const names = Array.from({ length: ARCHETYPES }, (_, index) => `arch-${index}`);

const premiumGeneration = (count30d: number, countAll: number, label: string) => {
  const files = Object.fromEntries(PREMIUM_ARTEFACT_NAMES.map((name) => [name, "[]"]));
  files["best-decks-30d"] = JSON.stringify(Array.from({ length: count30d }, (_, index) => ({ name: `${label}-30d-${index}` })));
  files["best-decks-all"] = JSON.stringify(Array.from({ length: countAll }, (_, index) => ({ name: `${label}-all-${index}` })));
  files["meta-share-30d"] = JSON.stringify({ generatedAt: DECK_DATE, decks: [] });
  files["meta-share-all"] = JSON.stringify({ generatedAt: DECK_DATE, decks: [] });
  return files;
};

const DEFAULT_BASELINE = premiumGeneration(30, 35, "default-baseline");
const DEFAULT_VERSION = premiumVersion(DEFAULT_BASELINE);

const writePremiumGeneration = (dir: string, files: Record<string, string>): void => {
  const fs = require("node:fs") as typeof import("node:fs");
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, `${name}.json`), content);
  }
};

const makeDecks = (date = DECK_DATE): Deck[] =>
  names.map((name, index) => {
    const opponents = Array.from(
      { length: OPPONENTS },
      (_, offset) => names[(index + 1 + offset) % ARCHETYPES]
    );
    return {
      id: `deck-${index}`,
      name,
      cards: [{ name: `Card ${index}`, count: 2, set: "A1", number: String(index + 1) }],
      pokemon: 2,
      differentPokemon: 1,
      winCount: 18,
      lossCount: 12,
      totalGames: 30,
      date,
      tournamentExPercent: 0.5,
      noTrainerPercent: 0,
      wins: opponents.flatMap((opponent) => [opponent, opponent, opponent]),
      losses: opponents.flatMap((opponent) => [opponent, opponent]),
    };
  });

describe("run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const fs = require("node:fs") as typeof import("node:fs");
    fs.rmSync(PREVIOUS_TEST_DIR, { recursive: true, force: true });
    snapshotPremiumVersion(DEFAULT_BASELINE, DEFAULT_VERSION, PREMIUM_TEST_DIR);
    vi.mocked(readPremiumVersionAtRef).mockReturnValue(DEFAULT_VERSION);
    vi.mocked(withStoreLock).mockImplementation((_dir, fn) => fn());
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    stageOgImages.mockImplementation(async (decks: { slug: string }[]) => ({
      slugs: decks.map((deck) => deck.slug),
      commit,
      discard,
    }));
    getDecks.mockReturnValue(makeDecks());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    const fs = require("node:fs") as typeof import("node:fs");
    fs.rmSync(PREVIOUS_TEST_DIR, { recursive: true, force: true });
  });

  it("writes every artefact together and then publishes the staged images", async () => {
    await run();

    expect(writeArtefacts).toHaveBeenCalledTimes(1);
    const files = writeArtefacts.mock.calls[0][0] as Record<string, string>;
    expect(Object.keys(files)).toHaveLength(24);
    for (const name of [
      "../public/data/best-decks.json",
      "../public/data/best-decks-10d.json",
      "../public/data/best-decks-20d.json",
      "../public/data/card-scores.json",
      "../public/data/historical-trends.json",
      "../src/app/last-updated.ts",
    ]) {
      expect(files).toHaveProperty([name]);
    }
    const bestDecks = JSON.parse(files["../public/data/best-decks.json"]);
    expect(bestDecks).toHaveLength(ARCHETYPES);
    expect(bestDecks.every((deck: { powerScore: number | null }) => deck.powerScore !== null)).toBe(true);
    expect(Object.keys(JSON.parse(files["../public/data/historical-trends.json"])[0])).toHaveLength(7);
    expect(files["../src/app/last-updated.ts"]).toContain("2026-09-24T12:00:00.000Z");
    expect(commit).toHaveBeenCalledTimes(1);
    expect(discard).not.toHaveBeenCalled();
  });

  it("keeps scores and the premium version stable when only the run date changes", async () => {
    const settings = await vi.importActual<typeof import("../settings")>("../settings");
    const firstRun = new Date(settings.EXPANSION_RELEASE_DATE.getTime() + 24 * 60 * 60 * 1000);
    const secondRun = new Date(firstRun.getTime() + 6 * 24 * 60 * 60 * 1000);
    getDecks.mockReturnValue(makeDecks(firstRun.toISOString()));
    vi.setSystemTime(firstRun);

    await run();
    const first = writeArtefacts.mock.calls[0][0] as Record<string, string>;
    vi.setSystemTime(secondRun);
    await run();
    const second = writeArtefacts.mock.calls[1][0] as Record<string, string>;

    expect(second["../public/data/best-decks-20d.json"]).toBe(
      first["../public/data/best-decks-20d.json"]
    );
    expect(second["../public/data/card-scores.json"]).toBe(
      first["../public/data/card-scores.json"]
    );
    expect(second["../public/data/data-version.json"]).toBe(
      first["../public/data/data-version.json"]
    );
  });

  it("keeps the 30d and all-time artefacts out of the public data directory", async () => {
    await run();

    const files = writeArtefacts.mock.calls[0][0] as Record<string, string>;
    const publicKeys = Object.keys(files).filter((key) => key.startsWith("../public/data/"));
    expect(publicKeys.filter((key) => /-(30d|all).json$/.test(key))).toEqual([]);
    expect(publicKeys).toHaveLength(12);
  });

  it("publishes matchup rows and movement only for the ten free decks of each window", async () => {
    await run();

    const files = writeArtefacts.mock.calls[0][0] as Record<string, string>;
    for (const [suffix, window] of [["", "20d"], ["-10d", "10d"], ["-20d", "20d"]]) {
      const ranked = JSON.parse(files[`../public/data/best-decks-${window}.json`]);
      const free = freeDeckNames(ranked);
      const matchups = JSON.parse(files[`../public/data/matchup-data${suffix}.json`]);
      const share = JSON.parse(files[`../public/data/meta-share${suffix}.json`]);

      expect(free.size).toBe(10);
      expect(Object.keys(matchups)).toHaveLength(ARCHETYPES);
      for (const [name, rows] of Object.entries(matchups) as [string, { name: string }[]][]) {
        if (free.has(name)) expect(rows.length).toBeGreaterThan(1);
        else expect(rows.map((row) => row.name)).toEqual(["Total"]);
      }
      expect(share.decks).toHaveLength(ARCHETYPES);
      for (const entry of share.decks as { name: string }[]) {
        const keys = Object.keys(entry);
        if (free.has(entry.name)) expect(keys).toContain("delta");
        else expect(keys).toEqual(["name", "share", "windowGames"]);
      }
    }
  });

  it("keeps the full 10d and 20d matchups and meta share in the premium directory", async () => {
    await run();

    const files = writeArtefacts.mock.calls[0][0] as Record<string, string>;
    for (const window of ["10d", "20d"]) {
      const matchups = JSON.parse(files[path.join(PREMIUM_TEST_DIR, `matchup-data-${window}.json`)]);
      const share = JSON.parse(files[path.join(PREMIUM_TEST_DIR, `meta-share-${window}.json`)]);

      for (const rows of Object.values(matchups) as unknown[][]) {
        expect(rows.length).toBeGreaterThan(1);
      }
      for (const entry of share.decks as object[]) {
        expect(Object.keys(entry)).toContain("delta");
      }
    }
  });

  it("writes the premium artefacts to the premium directory", async () => {
    await run();

    const files = writeArtefacts.mock.calls[0][0] as Record<string, string>;
    const premiumKeys = Object.keys(files).filter((key) => !key.startsWith("../"));
    expect(premiumKeys.sort()).toEqual(
      PREMIUM_ARTEFACT_NAMES.map((name) => path.join(PREMIUM_TEST_DIR, `${name}.json`)).sort()
    );
    expect(mkdirSync).toHaveBeenCalledWith(PREMIUM_TEST_DIR, { recursive: true });
    expect(mkdirSync.mock.invocationCallOrder[0]).toBeLessThan(
      writeArtefacts.mock.invocationCallOrder[0]
    );
  });

  it("publishes a data version that matches the premium artefacts", async () => {
    await run();

    const files = writeArtefacts.mock.calls[0][0] as Record<string, string>;
    const premium = Object.fromEntries(
      PREMIUM_ARTEFACT_NAMES.map((name) => [
        name,
        files[path.join(PREMIUM_TEST_DIR, `${name}.json`)],
      ])
    );
    expect(files["../public/data/data-version.json"]).toBe(
      renderDataVersion(premiumVersion(premium))
    );
  });

  it("writes the premium deck slug list beside the other frontend data", async () => {
    await run();

    const files = writeArtefacts.mock.calls[0][0] as Record<string, string>;
    expect(files["../src/data/premium-deck-slugs.json"]).toBe("{}\n");
  });

  it("lists a deck only the premium windows offer, by name and window", async () => {
    getDecks.mockReturnValue([
      ...makeDecks(),
      ...makeDecks("2026-09-01T02:00:00.000Z")
        .slice(0, 1)
        .map((deck) => ({ ...deck, id: "old-deck", name: "old-arch" })),
    ]);

    await run();

    const files = writeArtefacts.mock.calls[0][0] as Record<string, string>;
    expect(JSON.parse(files["../src/data/premium-deck-slugs.json"])).toEqual({
      "old-arch": ["30d", "all"],
    });
  });

  it("stages one image per archetype before anything is written", async () => {
    await run();

    const staged = stageOgImages.mock.calls[0][0] as { slug: string }[];
    expect(staged.map((deck) => deck.slug).sort()).toEqual([...names].sort());
    expect(stageOgImages.mock.invocationCallOrder[0]).toBeLessThan(
      writeArtefacts.mock.invocationCallOrder[0]
    );
  });

  it("refuses stale data, writes nothing and discards the staged images", async () => {
    vi.setSystemTime(new Date("2026-10-12T12:00:00.000Z"));

    const failure = (await run().catch((error: Error) => error)) as Error;

    expect(failure.message).toContain("newest deck is 19.4 days old, the limit is 7");
    expect(writeArtefacts).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
    expect(discard).toHaveBeenCalledTimes(1);
  });

  it("discards the staged images when writing fails", async () => {
    writeArtefacts.mockImplementationOnce(() => {
      throw new Error("disk full");
    });

    await expect(run()).rejects.toThrow("disk full");

    expect(commit).not.toHaveBeenCalled();
    expect(discard).toHaveBeenCalledTimes(1);
  });

  it("keeps published images when releasing the store lock fails", async () => {
    vi.mocked(withStoreLock).mockImplementationOnce((_dir, fn) => fn());
    vi.mocked(withStoreLock).mockImplementationOnce((_dir, fn) => {
      fn();
      throw new Error("lock release failed");
    });

    await expect(run()).rejects.toThrow("lock release failed");

    expect(writeArtefacts).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(discard).not.toHaveBeenCalled();
  });

  it("stops before staging when a list names a card the card database lacks", async () => {
    const decks = makeDecks();
    decks[0].cards = [{ name: "Ghost", count: 2, set: "A1", number: "9999" }];
    getDecks.mockReturnValue(decks);

    await expect(run()).rejects.toThrow("Card not found in API: a1-9999");

    expect(stageOgImages).not.toHaveBeenCalled();
  });

  it("asks the OG writer to retain the rendered set on a failed swap", async () => {
    await run();

    expect(commit).toHaveBeenCalledWith({ retainOnFailure: true });
  });

  it("says the JSON is published when the image swap fails after the write", async () => {
    commit.mockImplementationOnce(() => {
      throw new Error("rename failed");
    });

    await expect(run()).rejects.toThrow(
      "The JSON artefacts are published but the OG images are not: rename failed"
    );
    expect(writeArtefacts).toHaveBeenCalledTimes(1);
    expect(discard).not.toHaveBeenCalled();
  });

  it("refuses a run whose unmatched bucket passes the share limit", async () => {
    const bucket = Array.from({ length: 20 }, (_, index) => ({
      ...makeDecks()[0],
      id: `unmatched-${index}`,
      name: UNMATCHED_DECK,
      wins: [],
      losses: [],
    }));
    getDecks.mockReturnValue([...makeDecks(), ...bucket]);

    const failure = (await run().catch((error: Error) => error)) as Error;

    expect(failure.message).toContain(
      "20 decks matched no listing, 33.3% of the qualified games in 20d, the limit is 25%"
    );
    expect(writeArtefacts).not.toHaveBeenCalled();
    expect(discard).toHaveBeenCalledTimes(1);
  });

  it("reads each window's previous count against the current release and the premium baseline", async () => {
    await run();

    const baseline = path.join(PREVIOUS_TEST_DIR, DEFAULT_VERSION);
    expect(vi.mocked(readPreviousArchetypeCount).mock.calls).toEqual([
      ...["10d", "20d"].map((window) => [
        `../public/data/best-decks-${window}.json`,
        `../public/data/meta-share-${window}.json`,
        EXPANSION_RELEASE_DATE,
      ]),
      ...["30d", "all"].map((window) => [
        path.join(baseline, `best-decks-${window}.json`),
        path.join(baseline, `meta-share-${window}.json`),
        EXPANSION_RELEASE_DATE,
      ]),
    ]);
  });

  it("treats a premium window with no previous archetype count as a first run", async () => {
    await expect(run()).resolves.toBeUndefined();

    const windows = vi.mocked(assertPublishable).mock.calls[0][0].windows;
    expect(windows.filter((window) => ["30d", "all"].includes(window.id)).map((window) => window.previousArchetypeCount)).toEqual([null, null]);
    expect(writeArtefacts).toHaveBeenCalledTimes(1);
  });

  it("compares premium windows against the complete main snapshot", async () => {
    const actual = await vi.importActual<typeof import("../utils/assert-publishable")>(
      "../utils/assert-publishable"
    );
    const fs = await vi.importActual<typeof import("node:fs")>("node:fs");
    fs.rmSync(PREVIOUS_TEST_DIR, { recursive: true, force: true });
    const main = premiumGeneration(30, 35, "main");
    const version = premiumVersion(main);
    snapshotPremiumVersion(main, version, PREMIUM_TEST_DIR);
    vi.mocked(readPremiumVersionAtRef).mockReturnValue(version);
    const reader = vi.mocked(readPreviousArchetypeCount);
    reader.mockImplementation((best, meta, release) =>
      best.startsWith(PREVIOUS_TEST_DIR)
        ? actual.readPreviousArchetypeCount(best, meta, release)
        : null
    );

    try {
      await expect(run()).resolves.toBeUndefined();
    } finally {
      reader.mockImplementation(() => null);
      fs.rmSync(PREVIOUS_TEST_DIR, { recursive: true, force: true });
    }

    const windows = vi.mocked(assertPublishable).mock.calls[0][0].windows;
    expect(windows.find((window) => window.id === "30d")?.previousArchetypeCount).toBe(30);
    expect(windows.find((window) => window.id === "all")?.previousArchetypeCount).toBe(35);
  });

  it("uses the fetched main snapshot instead of the divergent local premium generation", async () => {
    const actual = await vi.importActual<typeof import("../utils/assert-publishable")>("../utils/assert-publishable");
    const fs = await vi.importActual<typeof import("node:fs")>("node:fs");
    fs.rmSync(PREVIOUS_TEST_DIR, { recursive: true, force: true });
    fs.rmSync(PREMIUM_TEST_DIR, { recursive: true, force: true });
    const main = premiumGeneration(31, 34, "main");
    const local = premiumGeneration(8, 9, "local");
    const mainVersion = premiumVersion(main);
    const localVersion = premiumVersion(local);
      expect(localVersion).not.toBe(mainVersion);
    writePremiumGeneration(PREMIUM_TEST_DIR, local);
    writePremiumGeneration(PREVIOUS_TEST_DIR, local);
    snapshotPremiumVersion(main, mainVersion, PREMIUM_TEST_DIR);
    vi.mocked(readPremiumVersionAtRef).mockReturnValue(mainVersion);
    vi.mocked(readPreviousArchetypeCount).mockImplementation((best, meta, release) =>
      best.startsWith(PREVIOUS_TEST_DIR) ? actual.readPreviousArchetypeCount(best, meta, release) : 17
    );

    try {
      await expect(run()).resolves.toBeUndefined();
    } finally {
      vi.mocked(readPreviousArchetypeCount).mockImplementation(() => null);
      fs.rmSync(PREVIOUS_TEST_DIR, { recursive: true, force: true });
      fs.rmSync(PREMIUM_TEST_DIR, { recursive: true, force: true });
    }

    const windows = vi.mocked(assertPublishable).mock.calls[0][0].windows;
    expect(windows.find((window) => window.id === "30d")?.previousArchetypeCount).toBe(31);
    expect(windows.find((window) => window.id === "all")?.previousArchetypeCount).toBe(34);
    expect(windows.filter((window) => ["10d", "20d"].includes(window.id)).map((window) => window.previousArchetypeCount)).toEqual([17, 17]);
  });

  it("treats a missing local snapshot as a first publish instead of refusing", async () => {
    const fs = await vi.importActual<typeof import("node:fs")>("node:fs");
    fs.rmSync(PREVIOUS_TEST_DIR, { recursive: true, force: true });
    fs.rmSync(PREMIUM_TEST_DIR, { recursive: true, force: true });
    const local = premiumGeneration(8, 9, "local");
    writePremiumGeneration(PREMIUM_TEST_DIR, local);
    writePremiumGeneration(PREVIOUS_TEST_DIR, local);
    vi.mocked(readPremiumVersionAtRef).mockReturnValue("0123456789abcdef");

    try {
      await expect(run()).resolves.toBeUndefined();
    } finally {
      fs.rmSync(PREVIOUS_TEST_DIR, { recursive: true, force: true });
      fs.rmSync(PREMIUM_TEST_DIR, { recursive: true, force: true });
    }

    const windows = vi.mocked(assertPublishable).mock.calls[0][0].windows;
    expect(windows.filter((window) => ["30d", "all"].includes(window.id)).map((window) => window.previousArchetypeCount)).toEqual([null, null]);
    expect(writeArtefacts).toHaveBeenCalledTimes(1);
  });

  it("refuses when the canonical main remote cannot be resolved", async () => {
    vi.mocked(resolveCanonicalMainRef).mockReturnValueOnce(undefined);

    const failure = (await run().catch((error: Error) => error)) as Error;
    expect(failure).toBeInstanceOf(Error);
    expect(failure.message).toMatch(/cannot resolve the canonical main remote/);
    expect(failure.message).not.toMatch(/--previous-ref/);
    expect(writeArtefacts).not.toHaveBeenCalled();
    expect(discard).toHaveBeenCalledTimes(1);
  });

  it("treats an unreadable main version file as a first publish", async () => {
    vi.mocked(readPremiumVersionAtRef).mockReturnValue(undefined);

    await expect(run()).resolves.toBeUndefined();
    const windows = vi.mocked(assertPublishable).mock.calls[0][0].windows;
    expect(windows.filter((window) => ["30d", "all"].includes(window.id)).map((window) => window.previousArchetypeCount)).toEqual([null, null]);
    expect(writeArtefacts).toHaveBeenCalledTimes(1);
  });

  it("passes the days of data since the release to the gate", async () => {
    await run();

    expect(vi.mocked(assertPublishable).mock.calls[0][0].daysOfData).toBe(
      daysOfDataSince(DECK_DATE, MOCKED_RELEASE_DATE)
    );
  });

  it("uses the newest deck for the ramp and the newest qualified deck for freshness", async () => {
    const newestUnqualified = {
      ...makeDecks()[0],
      id: "newest-unqualified",
      date: "2026-09-24T00:00:00.000Z",
      winCount: 0,
      lossCount: 30,
      wins: [],
      losses: [],
    };
    getDecks.mockReturnValue([...makeDecks(), newestUnqualified]);

    await run();

    const input = vi.mocked(assertPublishable).mock.calls[0][0];
    expect(input.daysOfData).toBe(
      daysOfDataSince(newestUnqualified.date, MOCKED_RELEASE_DATE)
    );
    expect(input.newestDeckDate).toBe(DECK_DATE);
  });
});
