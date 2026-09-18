import { afterEach, describe, expect, it, vi } from "vitest";

const loadSettings = async (now: Date) => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  const settings = await import("../settings");
  vi.useRealTimers();
  return settings;
};

const weeksAfterRelease = (releaseDate: Date, weeks: number): Date =>
  new Date(releaseDate.getTime() + weeks * 7 * 24 * 60 * 60 * 1000);

afterEach(() => {
  vi.useRealTimers();
});

describe("scoringWeights", () => {
  it("derives current exported weights from the pure calculation", async () => {
    const now = new Date("2026-09-18T00:00:00.000Z");
    const {
      EXPANSION_RELEASE_DATE,
      NEW_MULTIPLIER,
      POPULARITY_IMPORTANCE,
      scoringWeights,
      WINRATE_IMPORTANCE,
    } = await loadSettings(now);
    const weights = scoringWeights(now);

    expect(WINRATE_IMPORTANCE).toBe(weights.winrateImportance);
    expect(POPULARITY_IMPORTANCE).toBe(weights.popularityImportance);
    expect(NEW_MULTIPLIER).toBe(weights.newMultiplier);
    expect(EXPANSION_RELEASE_DATE).toBeInstanceOf(Date);
  });

  it("starts with the release-day weights", async () => {
    const { EXPANSION_RELEASE_DATE, scoringWeights } = await loadSettings(
      new Date("2026-09-18T00:00:00.000Z")
    );

    expect(scoringWeights(weeksAfterRelease(EXPANSION_RELEASE_DATE, 0))).toEqual({
      winrateImportance: 0.2,
      popularityImportance: 0.8,
      newMultiplier: 1,
    });
  });

  it("ramps weights through the first two weeks", async () => {
    const { EXPANSION_RELEASE_DATE, scoringWeights } = await loadSettings(
      new Date("2026-09-18T00:00:00.000Z")
    );

    expect(scoringWeights(weeksAfterRelease(EXPANSION_RELEASE_DATE, 1))).toEqual({
      winrateImportance: 0.35,
      popularityImportance: 0.65,
      newMultiplier: 1 + 1 / 1.5,
    });
    expect(scoringWeights(weeksAfterRelease(EXPANSION_RELEASE_DATE, 2))).toEqual({
      winrateImportance: 0.5,
      popularityImportance: 0.5,
      newMultiplier: 1 + 2 / 1.5,
    });
  });

  it("caps win-rate importance at week four and beyond", async () => {
    const { EXPANSION_RELEASE_DATE, scoringWeights } = await loadSettings(
      new Date("2026-09-18T00:00:00.000Z")
    );

    expect(scoringWeights(weeksAfterRelease(EXPANSION_RELEASE_DATE, 4))).toEqual({
      winrateImportance: 0.75,
      popularityImportance: 0.25,
      newMultiplier: 1 + 4 / 1.5,
    });
    expect(scoringWeights(weeksAfterRelease(EXPANSION_RELEASE_DATE, 52))).toEqual({
      winrateImportance: 0.75,
      popularityImportance: 0.25,
      newMultiplier: 1 + 52 / 1.5,
    });
  });

  it("keeps weights summing to one at the boundary and mid-ramp weeks", async () => {
    const { EXPANSION_RELEASE_DATE, scoringWeights } = await loadSettings(
      new Date("2026-09-18T00:00:00.000Z")
    );

    for (const weeks of [0, 1, 2.5866, 4, 52]) {
      const weights = scoringWeights(weeksAfterRelease(EXPANSION_RELEASE_DATE, weeks));
      expect(weights.winrateImportance + weights.popularityImportance).toBe(1);
    }
  });

  it("returns the release-day baseline for dates before the release", async () => {
    const { EXPANSION_RELEASE_DATE, scoringWeights } = await loadSettings(
      new Date("2026-09-18T00:00:00.000Z")
    );
    const beforeRelease = weeksAfterRelease(EXPANSION_RELEASE_DATE, -1);

    expect(scoringWeights(beforeRelease)).toEqual({
      winrateImportance: 0.2,
      popularityImportance: 0.8,
      newMultiplier: 1,
    });
  });
});
