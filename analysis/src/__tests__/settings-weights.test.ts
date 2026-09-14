import {
  EXPANSION_RELEASE_DATE,
  NEW_MULTIPLIER,
  POPULARITY_IMPORTANCE,
  scoringWeights,
  WINRATE_IMPORTANCE,
} from "../settings";

const weeksAfterRelease = (weeks: number): Date =>
  new Date(EXPANSION_RELEASE_DATE.getTime() + weeks * 7 * 24 * 60 * 60 * 1000);

describe("scoringWeights", () => {
  it("derives current exported weights from the pure calculation", () => {
    const weights = scoringWeights(new Date());
    expect(WINRATE_IMPORTANCE).toBeCloseTo(weights.winrateImportance, 5);
    expect(POPULARITY_IMPORTANCE).toBeCloseTo(weights.popularityImportance, 5);
    expect(NEW_MULTIPLIER).toBeCloseTo(weights.newMultiplier, 5);
  });

  it("starts with the release-day weights", () => {
    expect(scoringWeights(weeksAfterRelease(0))).toEqual({
      winrateImportance: 0.2,
      popularityImportance: 0.8,
      newMultiplier: 1,
    });
  });

  it("ramps weights through the first two weeks", () => {
    expect(scoringWeights(weeksAfterRelease(1))).toEqual({
      winrateImportance: 0.35,
      popularityImportance: 0.65,
      newMultiplier: 1 + 1 / 1.5,
    });
    expect(scoringWeights(weeksAfterRelease(2))).toEqual({
      winrateImportance: 0.5,
      popularityImportance: 0.5,
      newMultiplier: 1 + 2 / 1.5,
    });
  });

  it("caps win-rate importance at week four and beyond", () => {
    expect(scoringWeights(weeksAfterRelease(4))).toEqual({
      winrateImportance: 0.75,
      popularityImportance: 0.25,
      newMultiplier: 1 + 4 / 1.5,
    });
    expect(scoringWeights(weeksAfterRelease(52))).toEqual({
      winrateImportance: 0.75,
      popularityImportance: 0.25,
      newMultiplier: 1 + 52 / 1.5,
    });
  });

  it("keeps weights summing to one at the boundary and mid-ramp weeks", () => {
    for (const weeks of [0, 1, 2.5866, 4, 52]) {
      const weights = scoringWeights(weeksAfterRelease(weeks));
      expect(weights.winrateImportance + weights.popularityImportance).toBe(1);
    }
  });
});
