import {
  DeckPowerInput,
  buildDeckPower,
  toPowerScale,
} from "../utils/build-deck-power";

// Three decks. games14 of 100/50/50 gives share14 of 0.5/0.25/0.25 and
// freqScore of 100/50/50. With MATCHUP_PRIOR_GAMES = 30 every expected win
// rate below is checkable on paper.
const fixture = (): DeckPowerInput[] => [
  {
    name: "alpha",
    games14: 100,
    matchups: [
      // (0.6*70 + 30*0.5) / (70+30) = 0.57
      { name: "beta", winRate: 0.6, totalGames: 70 },
      // (0.4*30 + 15) / (30+30) = 0.45
      { name: "gamma", winRate: 0.4, totalGames: 30 },
      { name: "Total", winRate: 0.55, totalGames: 100 },
    ],
  },
  {
    name: "beta",
    games14: 50,
    matchups: [
      // (0.4*70 + 15) / 100 = 0.43
      { name: "alpha", winRate: 0.4, totalGames: 70 },
      // dropped: below MIN_MATCHUP_GAMES
      { name: "gamma", winRate: 0.5, totalGames: 4 },
      { name: "Total", winRate: 0.41, totalGames: 74 },
    ],
  },
  {
    name: "gamma",
    games14: 50,
    matchups: [
      // only faces beta, so coverage is 0.25 and gamma is unranked
      { name: "beta", winRate: 0.6, totalGames: 30 },
      { name: "Total", winRate: 0.6, totalGames: 30 },
    ],
  },
];

const by = (rows: ReturnType<typeof buildDeckPower>, name: string) =>
  rows.find((r) => r.name === name)!;

describe("toPowerScale", () => {
  it("anchors an even win rate at exactly 50", () => {
    // The whole point of the VS scale: 50% reads as 50 whatever the field.
    expect(toPowerScale(0.5, 0.53)).toBeCloseTo(50, 10);
    expect(toPowerScale(0.5, 0.6)).toBeCloseTo(50, 10);
  });

  it("puts the best deck at 100", () => {
    expect(toPowerScale(0.53, 0.53)).toBeCloseTo(100, 10);
  });

  it("clamps below the zero point rather than going negative", () => {
    // Zero sits at 1 - maxWR = 0.47, so 0.40 would compute to -70.
    expect(toPowerScale(0.4, 0.53)).toBe(0);
  });

  it("returns 50 when no deck is above even, so the scale cannot invert", () => {
    // span = 2*maxWR - 1 would be zero or negative here.
    expect(toPowerScale(0.48, 0.5)).toBe(50);
    expect(toPowerScale(0.48, 0.45)).toBe(50);
  });
});

describe("buildDeckPower", () => {
  it("smooths each matchup toward 50% by its own sample size", () => {
    const alpha = by(buildDeckPower(fixture()), "alpha");
    // (0.25*0.57 + 0.25*0.45) / 0.5 = 0.51
    expect(alpha.expectedWinRate).toBeCloseTo(0.51, 10);
  });

  it("ignores the Total row and rows below MIN_MATCHUP_GAMES", () => {
    const beta = by(buildDeckPower(fixture()), "beta");
    // gamma's 4-game row is dropped, so only alpha counts: coverage 0.5.
    expect(beta.fieldCoverage).toBeCloseTo(0.5, 10);
    expect(beta.expectedWinRate).toBeCloseTo(0.43, 10);
  });

  it("marks a deck unranked when coverage is below the bar", () => {
    const gamma = by(buildDeckPower(fixture()), "gamma");
    expect(gamma.fieldCoverage).toBeCloseTo(0.25, 10);
    expect(gamma.powerScore).toBeNull();
    expect(gamma.metaScore).toBeNull();
    // An unranked deck still reports frequency and its expected win rate.
    expect(gamma.freqScore).toBeCloseTo(50, 10);
    expect(gamma.expectedWinRate).toBeGreaterThan(0);
  });

  it("scales power against the best ranked deck only", () => {
    const rows = buildDeckPower(fixture());
    // maxWR is alpha's 0.51, so zero sits at 0.49 and span is 0.02.
    expect(by(rows, "alpha").powerScore).toBeCloseTo(100, 10);
    // beta at 0.43 computes to -300 and clamps.
    expect(by(rows, "beta").powerScore).toBe(0);
  });

  it("sets Frequency Score against the most played deck", () => {
    const rows = buildDeckPower(fixture());
    expect(by(rows, "alpha").freqScore).toBeCloseTo(100, 10);
    expect(by(rows, "beta").freqScore).toBeCloseTo(50, 10);
  });

  it("averages power and frequency into the meta score", () => {
    const rows = buildDeckPower(fixture());
    expect(by(rows, "alpha").metaScore).toBeCloseTo(100, 10);
    // (0 + 50) / 2
    expect(by(rows, "beta").metaScore).toBeCloseTo(25, 10);
  });

  it("returns an empty array for an empty field", () => {
    expect(buildDeckPower([])).toEqual([]);
  });

  it("marks every deck unranked when none clears the coverage bar", () => {
    const rows = buildDeckPower([
      { name: "solo", games14: 10, matchups: [{ name: "Total", winRate: 0.5, totalGames: 10 }] },
    ]);
    expect(rows[0].powerScore).toBeNull();
    expect(rows[0].fieldCoverage).toBe(0);
  });
});
