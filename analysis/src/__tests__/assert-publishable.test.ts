import fs from "fs";
import os from "os";
import path from "path";
import { PipelinePartialDeck } from "../../../src/types/pipeline-data";
import {
  assertPublishable,
  newestDeckDate,
  publishFailures,
  PublishCheckInput,
  readArchetypeCount,
  readPreviousArchetypeCount,
  WindowSnapshot,
} from "../utils/assert-publishable";

const makeArchetype = (name: string, powerScore: number | null): PipelinePartialDeck => ({
  name,
  lists: [],
  popularity: 0.01,
  percentOfGames: 0.01,
  score: 0.5,
  expectedWinRate: 0.5,
  fieldCoverage: powerScore === null ? 0 : 0.9,
  powerScore,
  freqScore: 1,
  metaScore: powerScore,
});

const archetypes = (total: number, ranked: number): PipelinePartialDeck[] =>
  Array.from({ length: total }, (_, index) =>
    makeArchetype(`deck-${index}`, index < ranked ? 50 : null)
  );

const snapshot = (id: string, total: number, ranked: number, previous: number | null = null): WindowSnapshot => ({
  id,
  bestDecks: archetypes(total, ranked),
  previousArchetypeCount: previous,
});

const healthy = (): PublishCheckInput => {
  const names = archetypes(60, 40).map((deck) => deck.name);
  return {
    windows: [
      snapshot("10d", 25, 20, 24),
      snapshot("20d", 49, 40, 50),
      snapshot("30d", 60, 50, 60),
      snapshot("all", 60, 50, 60),
    ],
    defaultWindow: "20d",
    deckSlugs: names,
    newestDeckDate: "2026-10-10T00:00:00.000Z",
    now: new Date("2026-10-12T12:00:00.000Z"),
    currentSet: "B4a",
    newestSet: "B4a",
    currentSetListingCount: 40,
    unmatchedDecks: { decks: 6, games: 54, qualifiedGames: 13344 },
  };
};

const replaceWindow = (input: PublishCheckInput, next: WindowSnapshot): PublishCheckInput => ({
  ...input,
  windows: input.windows.map((window) => (window.id === next.id ? next : window)),
});

describe("publishFailures", () => {
  it("passes a healthy run", () => {
    expect(publishFailures(healthy())).toEqual([]);
  });

  it("blocks a window with too few archetypes", () => {
    const input = replaceWindow(healthy(), snapshot("20d", 24, 24));
    expect(publishFailures(input)).toEqual(["20d: only 24 archetypes, the floor is 25"]);
  });

  it("applies each window's own floor", () => {
    const input = replaceWindow(healthy(), snapshot("10d", 11, 11));
    expect(publishFailures(input)).toEqual(["10d: only 11 archetypes, the floor is 12"]);
  });

  it("blocks a window that falls below half the previous count", () => {
    const input = replaceWindow(healthy(), snapshot("30d", 60, 50, 130));
    expect(publishFailures(input)).toEqual([
      "30d: 60 archetypes is under 50% of the previous 130",
    ]);
  });

  it("allows a first run with no previous snapshot", () => {
    const input = replaceWindow(healthy(), snapshot("all", 60, 50, null));
    expect(publishFailures(input)).toEqual([]);
  });

  it("blocks a default window where almost no archetype has a Power Score", () => {
    const input = replaceWindow(healthy(), snapshot("20d", 49, 19));
    expect(publishFailures(input)).toEqual([
      "20d: only 19 archetypes have a Power Score, the floor is 20",
    ]);
  });

  it("does not demand Power Scores from the other windows", () => {
    const input = replaceWindow(healthy(), snapshot("10d", 25, 0));
    expect(publishFailures(input)).toEqual([]);
  });

  it("blocks a run missing its default window", () => {
    const input = { ...healthy(), windows: healthy().windows.filter((window) => window.id !== "20d") };
    expect(publishFailures(input)).toEqual(["default window 20d is missing"]);
  });

  it("blocks a window with no configured floor", () => {
    const input = { ...healthy(), windows: [...healthy().windows, snapshot("90d", 99, 99)] };
    expect(publishFailures(input)).toEqual(["90d: no archetype floor is configured for this window"]);
  });

  it("accepts a run exactly at every floor", () => {
    const input: PublishCheckInput = {
      ...healthy(),
      windows: [
        snapshot("10d", 12, 0, 24),
        snapshot("20d", 25, 20, 50),
        snapshot("30d", 32, 0, 64),
        snapshot("all", 32, 0, 64),
      ],
      newestDeckDate: "2026-10-05T12:00:00.000Z",
    };
    expect(publishFailures(input)).toEqual([]);
  });

  it("blocks stale data even when every window is full", () => {
    const input = { ...healthy(), newestDeckDate: "2026-09-23T02:00:00.000Z" };
    expect(publishFailures(input)).toEqual(["newest deck is 19.4 days old, the limit is 7"]);
  });

  // The limit itself, not a grossly stale date: widening it by a day has to
  // fail here or nothing stops stale data reaching the site.
  it("accepts a deck exactly at the age limit", () => {
    const input = { ...healthy(), newestDeckDate: "2026-10-05T12:00:00.000Z" };
    expect(publishFailures(input)).toEqual([]);
  });

  it("blocks a deck a tenth of a day past the age limit", () => {
    const input = { ...healthy(), newestDeckDate: "2026-10-05T09:36:00.000Z" };
    expect(publishFailures(input)).toEqual(["newest deck is 7.1 days old, the limit is 7"]);
  });

  it("blocks a run with no dated decks", () => {
    const input = { ...healthy(), newestDeckDate: null };
    expect(publishFailures(input)).toEqual(["no qualified decks to date the data"]);
  });

  it("blocks two archetypes that share a slug", () => {
    const input = healthy();
    const deckSlugs = [...input.deckSlugs.slice(1), input.deckSlugs[1]];
    expect(
      publishFailures({ ...input, deckSlugs })
    ).toEqual(["1 decks share a slug: deck-1"]);
  });

  it("blocks a listing store whose current set lags", () => {
    const input = { ...healthy(), currentSet: "B4", currentSetListingCount: 0 };
    expect(publishFailures(input)).toEqual([
      "listing store current set is B4, expected B4a",
      "listing store has no rows for B4a",
    ]);
  });

  it("passes the unmatched share the real data carries", () => {
    expect(publishFailures(healthy())).toEqual([]);
  });

  it("blocks a swollen unmatched bucket", () => {
    const input = {
      ...healthy(),
      unmatchedDecks: { decks: 400, games: 4800, qualifiedGames: 13344 },
    };
    expect(publishFailures(input)).toEqual([
      "400 decks matched no listing, 36.0% of the qualified games in 20d, the limit is 25%",
    ]);
  });

  it("accepts an unmatched share exactly at the limit", () => {
    const input = {
      ...healthy(),
      unmatchedDecks: { decks: 300, games: 3336, qualifiedGames: 13344 },
    };
    expect(publishFailures(input)).toEqual([]);
  });

  it("blocks an unmatched share a tenth of a point past the limit", () => {
    const input = {
      ...healthy(),
      unmatchedDecks: { decks: 300, games: 3350, qualifiedGames: 13344 },
    };
    expect(publishFailures(input)).toEqual([
      "300 decks matched no listing, 25.1% of the qualified games in 20d, the limit is 25%",
    ]);
  });

});

describe("assertPublishable", () => {
  it("throws every failure in one message", () => {
    const input = { ...healthy(), newestDeckDate: "2026-09-23T02:00:00.000Z", currentSet: null };
    expect(() => assertPublishable(input)).toThrow(
      /Refusing to publish:\n- newest deck is 19.4 days old, the limit is 7\n- listing store current set is unset, expected B4a/
    );
  });

  it("does not throw for a healthy run", () => {
    expect(() => assertPublishable(healthy())).not.toThrow();
  });
});

describe("newestDeckDate", () => {
  it("returns the latest date, whatever the order", () => {
    expect(
      newestDeckDate([
        { date: "2026-09-02T00:00:00.000Z" },
        { date: "2026-09-23T02:00:00.000Z" },
        { date: "2026-09-10T00:00:00.000Z" },
      ])
    ).toBe("2026-09-23T02:00:00.000Z");
  });

  it("returns null for no decks", () => {
    expect(newestDeckDate([])).toBeNull();
  });
});

describe("readArchetypeCount", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "archetype-count-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("counts the entries of a previous best-decks file", () => {
    const file = path.join(dir, "best-decks.json");
    fs.writeFileSync(file, JSON.stringify([{ name: "a" }, { name: "b" }]));
    expect(readArchetypeCount(file)).toBe(2);
  });

  it("returns null when the file is missing, corrupt or not a list", () => {
    expect(readArchetypeCount(path.join(dir, "absent.json"))).toBeNull();
    const corrupt = path.join(dir, "corrupt.json");
    fs.writeFileSync(corrupt, "{not json");
    expect(readArchetypeCount(corrupt)).toBeNull();
    const object = path.join(dir, "object.json");
    fs.writeFileSync(object, "{}");
    expect(readArchetypeCount(object)).toBeNull();
  });
});

describe("readPreviousArchetypeCount", () => {
  const release = new Date("2026-08-27");
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "previous-count-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const write = (name: string, value: unknown): string => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value));
    return file;
  };

  it("counts a previous publish from the current expansion", () => {
    const bestDecks = write("best-decks.json", [{ name: "a" }, { name: "b" }]);
    const metaShare = write("meta-share.json", { generatedAt: "2026-09-01T00:00:00.000Z", decks: [] });
    expect(readPreviousArchetypeCount(bestDecks, metaShare, release)).toBe(2);
  });

  it("counts a previous publish made exactly at the release", () => {
    const bestDecks = write("best-decks.json", [{ name: "a" }]);
    const metaShare = write("meta-share.json", { generatedAt: "2026-08-27T00:00:00.000Z", decks: [] });
    expect(readPreviousArchetypeCount(bestDecks, metaShare, release)).toBe(1);
  });

  it("ignores a previous publish from before the current release", () => {
    const bestDecks = write("best-decks.json", [{ name: "a" }, { name: "b" }]);
    const metaShare = write("meta-share.json", { generatedAt: "2026-08-26T23:59:59.000Z", decks: [] });
    expect(readPreviousArchetypeCount(bestDecks, metaShare, release)).toBeNull();
  });

  it("ignores a previous publish it cannot date", () => {
    const bestDecks = write("best-decks.json", [{ name: "a" }]);
    expect(readPreviousArchetypeCount(bestDecks, path.join(dir, "absent.json"), release)).toBeNull();
    expect(readPreviousArchetypeCount(bestDecks, write("corrupt.json", "{not json"), release)).toBeNull();
    expect(readPreviousArchetypeCount(bestDecks, write("undated.json", { decks: [] }), release)).toBeNull();
    expect(readPreviousArchetypeCount(bestDecks, write("bad-date.json", { generatedAt: "soon" }), release)).toBeNull();
  });
});
