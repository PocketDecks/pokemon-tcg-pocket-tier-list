import path from "node:path";
import { vi } from "vitest";
import { Deck } from "../utils/types";

const { writeArtefacts, stageOgImages, getDecks, commit, discard, mkdirSync, PREMIUM_TEST_DIR } = vi.hoisted(() => ({
  mkdirSync: vi.fn(),
  PREMIUM_TEST_DIR: `${require("node:os").tmpdir()}/no-such-premium-directory`,
  writeArtefacts: vi.fn(),
  stageOgImages: vi.fn(),
  getDecks: vi.fn(),
  commit: vi.fn(),
  discard: vi.fn(),
}));

vi.mock("../load-env-side-effect", () => ({}));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, default: { ...actual, mkdirSync }, mkdirSync };
});
vi.mock("../utils/premium-artefacts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../utils/premium-artefacts")>();
  return { ...actual, PREMIUM_DIR: PREMIUM_TEST_DIR };
});
vi.mock("../utils/write-artifacts", () => ({ writeArtefacts }));
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
  PREMIUM_ARTEFACT_NAMES,
  premiumVersion,
  renderDataVersion,
} from "../utils/premium-artefacts";

const { MOCKED_RELEASE_DATE } = vi.hoisted(() => ({
  MOCKED_RELEASE_DATE: new Date("2026-08-20T00:00:00.000Z"),
}));

const NOW = new Date("2026-09-24T12:00:00.000Z");
const DECK_DATE = "2026-09-23T02:00:00.000Z";
const ARCHETYPES = 40;
const OPPONENTS = 30;
const names = Array.from({ length: ARCHETYPES }, (_, index) => `arch-${index}`);

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

  it("stops before staging when a list names a card the card database lacks", async () => {
    const decks = makeDecks();
    decks[0].cards = [{ name: "Ghost", count: 2, set: "A1", number: "9999" }];
    getDecks.mockReturnValue(decks);

    await expect(run()).rejects.toThrow("Card not found in API: a1-9999");

    expect(stageOgImages).not.toHaveBeenCalled();
  });

  it("says the JSON is published when the image swap fails after the write", async () => {
    commit.mockImplementationOnce(() => {
      throw new Error("rename failed");
    });

    await expect(run()).rejects.toThrow(
      "The JSON artefacts are published but the OG images are not: rename failed"
    );
    expect(writeArtefacts).toHaveBeenCalledTimes(1);
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

  it("reads each window's previous count against the current release", async () => {
    await run();

    expect(vi.mocked(readPreviousArchetypeCount).mock.calls).toEqual(
      ["10d", "20d", "30d", "all"].map((window) => {
        const locate = (file: string) =>
          ["30d", "all"].includes(window)
            ? path.join(PREMIUM_TEST_DIR, file)
            : `../public/data/${file}`;
        return [
          locate(`best-decks-${window}.json`),
          locate(`meta-share-${window}.json`),
          EXPANSION_RELEASE_DATE,
        ];
      })
    );
  });

  it("treats a premium window with no previous premium file as a first run", async () => {
    const actual = await vi.importActual<typeof import("../utils/assert-publishable")>(
      "../utils/assert-publishable"
    );
    const reader = vi.mocked(readPreviousArchetypeCount);
    for (let call = 0; call < 4; call += 1) {
      reader.mockImplementationOnce((best, meta, release) =>
        best.startsWith(PREMIUM_TEST_DIR) ? actual.readPreviousArchetypeCount(best, meta, release) : null
      );
    }

    await expect(run()).resolves.toBeUndefined();

    expect(reader.mock.results.map((result) => result.value)).toEqual([null, null, null, null]);
    expect(writeArtefacts).toHaveBeenCalledTimes(1);
  });

  it("passes the days of data since the release to the gate", async () => {
    await run();

    expect(vi.mocked(assertPublishable).mock.calls[0][0].daysOfData).toBe(
      daysOfDataSince(DECK_DATE, MOCKED_RELEASE_DATE)
    );
  });
});
