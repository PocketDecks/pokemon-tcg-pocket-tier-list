import { EXPANSION_RELEASE_DATE, scoringWeights } from "../settings";

const weeksAfterRelease = (releaseDate: Date, weeks: number): Date =>
  new Date(releaseDate.getTime() + weeks * 7 * 24 * 60 * 60 * 1000);

describe("scoringWeights", () => {
  it("starts with the release-day weights", () => {
    expect(scoringWeights(weeksAfterRelease(EXPANSION_RELEASE_DATE, 0))).toEqual({
      winrateImportance: 0.2,
      popularityImportance: 0.8,
    });
  });

  it("ramps weights through the first two weeks", () => {
    expect(scoringWeights(weeksAfterRelease(EXPANSION_RELEASE_DATE, 1))).toEqual({
      winrateImportance: 0.35,
      popularityImportance: 0.65,
    });
    expect(scoringWeights(weeksAfterRelease(EXPANSION_RELEASE_DATE, 2))).toEqual({
      winrateImportance: 0.5,
      popularityImportance: 0.5,
    });
  });

  it("caps win-rate importance at week four and beyond", () => {
    expect(scoringWeights(weeksAfterRelease(EXPANSION_RELEASE_DATE, 4))).toEqual({
      winrateImportance: 0.75,
      popularityImportance: 0.25,
    });
    expect(scoringWeights(weeksAfterRelease(EXPANSION_RELEASE_DATE, 52))).toEqual({
      winrateImportance: 0.75,
      popularityImportance: 0.25,
    });
  });

  it("keeps weights summing to one at the boundary and mid-ramp weeks", () => {
    for (const weeks of [0, 1, 2.5866, 4, 52]) {
      const weights = scoringWeights(weeksAfterRelease(EXPANSION_RELEASE_DATE, weeks));
      expect(weights.winrateImportance + weights.popularityImportance).toBe(1);
    }
  });

  it("returns the release-day baseline for dates before the release", () => {
    const beforeRelease = weeksAfterRelease(EXPANSION_RELEASE_DATE, -1);

    expect(scoringWeights(beforeRelease)).toEqual({
      winrateImportance: 0.2,
      popularityImportance: 0.8,
    });
  });
});
