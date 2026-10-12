import { vi } from "vitest";
import { Deck } from "../utils/types";

const { writeArtefacts, stageOgImages, getDecks, commit, discard } = vi.hoisted(() => ({
  writeArtefacts: vi.fn(),
  stageOgImages: vi.fn(),
  getDecks: vi.fn(),
  commit: vi.fn(),
  discard: vi.fn(),
}));

vi.mock("../load-env-side-effect", () => ({}));
vi.mock("../utils/write-artifacts", () => ({ writeArtefacts }));
vi.mock("../utils/generate-og-images", () => ({ stageOgImages }));
vi.mock("../utils/get-decks", () => ({ default: getDecks }));
vi.mock("../utils/assert-publishable", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../utils/assert-publishable")>()),
  readPreviousArchetypeCount: vi.fn(() => null),
}));

import { run } from "../get-best-decks";
import { UNMATCHED_DECK } from "../utils/get-deck-name";
import { readPreviousArchetypeCount } from "../utils/assert-publishable";
import { EXPANSION_RELEASE_DATE } from "../settings";

const NOW = new Date("2026-09-24T12:00:00.000Z");
const ARCHETYPES = 40;
const OPPONENTS = 30;
const names = Array.from({ length: ARCHETYPES }, (_, index) => `arch-${index}`);

const makeDecks = (date = "2026-09-23T02:00:00.000Z"): Deck[] =>
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
    expect(Object.keys(files)).toHaveLength(18);
    for (const name of [
      "../public/data/best-decks.json",
      "../public/data/best-decks-10d.json",
      "../public/data/best-decks-all.json",
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
      ["10d", "20d", "30d", "all"].map((window) => [
        `../public/data/best-decks-${window}.json`,
        `../public/data/meta-share-${window}.json`,
        EXPANSION_RELEASE_DATE,
      ])
    );
  });
});
