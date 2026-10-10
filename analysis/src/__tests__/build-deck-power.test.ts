import {
  DeckPowerInput,
  buildDeckPower,
  toPowerScale,
} from "../utils/build-deck-power";

// Three decks. windowGames of 100/50/100 gives share14 of 0.4/0.2/0.4 and freqScore
// of 100/50/50. With MATCHUP_PRIOR_GAMES = 30 every expected win rate below is
// checkable on paper. gamma only faces beta, whose 0.2 share sits under the
// coverage bar, so gamma stays the deliberately unranked deck.
const fixture = (): DeckPowerInput[] => [
  {
    name: "alpha",
    windowGames: 100,
    matchups: [
      // (0.6*70 + 30*0.5) / (70+30) = 0.57
      { name: "beta", winRate: 0.6, totalGames: 70 },
      // (0.6*30 + 15) / (30+30) = 0.55
      { name: "gamma", winRate: 0.6, totalGames: 30 },
      { name: "Total", winRate: 0.6, totalGames: 100 },
    ],
  },
  {
    name: "beta",
    windowGames: 50,
    matchups: [
      // (0.4*70 + 15) / 100 = 0.43
      { name: "alpha", winRate: 0.4, totalGames: 70 },
      // dropped: below MIN_MATCHUP_GAMES
      { name: "gamma", winRate: 0.5, totalGames: 1 },
      { name: "Total", winRate: 0.41, totalGames: 71 },
    ],
  },
  {
    name: "gamma",
    windowGames: 100,
    matchups: [
      // only faces beta, whose 0.2 share is under the bar, so gamma is unranked
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
    // (0.2*0.57 + 0.4*0.55) / 0.6 = 0.5566...
    expect(alpha.expectedWinRate).toBeCloseTo(0.334 / 0.6, 10);
  });

  it("ignores the Total row and rows below MIN_MATCHUP_GAMES", () => {
    const beta = by(buildDeckPower(fixture()), "beta");
    // gamma's 1-game row is dropped, so only alpha counts: coverage 0.4.
    expect(beta.fieldCoverage).toBeCloseTo(0.4, 10);
    expect(beta.expectedWinRate).toBeCloseTo(0.43, 10);
  });

  it("keeps a row between the recalibrated floor and the old one", () => {
    // A 3-game row clears MIN_MATCHUP_GAMES = 2 and would have been discarded
    // at the previous floor of 5. Both opponents are in the field, so alpha
    // covers 100 + 50 of the 250-game total.
    const rows = buildDeckPower([
      {
        name: "alpha",
        windowGames: 100,
        matchups: [
          { name: "beta", winRate: 0.6, totalGames: 70 },
          { name: "gamma", winRate: 0.7, totalGames: 3 },
        ],
      },
      { name: "beta", windowGames: 100, matchups: [] },
      { name: "gamma", windowGames: 50, matchups: [] },
    ]);
    expect(by(rows, "alpha").fieldCoverage).toBeCloseTo(0.6, 10);
  });

  it("still drops a row below the recalibrated floor", () => {
    const rows = buildDeckPower([
      {
        name: "alpha",
        windowGames: 100,
        matchups: [{ name: "beta", winRate: 0.9, totalGames: 1.5 }],
      },
      { name: "beta", windowGames: 50, matchups: [] },
    ]);
    expect(by(rows, "alpha").fieldCoverage).toBe(0);
  });

  it("marks a deck unranked when coverage is below the bar", () => {
    const gamma = by(buildDeckPower(fixture()), "gamma");
    expect(gamma.fieldCoverage).toBeCloseTo(0.2, 10);
    expect(gamma.powerScore).toBeNull();
    expect(gamma.metaScore).toBeNull();
    // An unranked deck still reports frequency and its expected win rate.
    expect(gamma.freqScore).toBeCloseTo(100, 10);
    expect(gamma.expectedWinRate).toBeGreaterThan(0);
  });

  // Exact coverage boundaries for the bar: 75/25 puts the thin deck on it, 80/20
  // puts it under. Both decks are mutually covered so coverage is the share of
  // the single opponent row each one holds.
  it("ranks a deck whose coverage meets the bar exactly", () => {
    const rows = buildDeckPower([
      {
        name: "wide",
        windowGames: 75,
        matchups: [{ name: "narrow", winRate: 0.5, totalGames: 60 }],
      },
      {
        name: "narrow",
        windowGames: 25,
        matchups: [{ name: "wide", winRate: 0.5, totalGames: 60 }],
      },
    ]);
    expect(by(rows, "wide").fieldCoverage).toBeCloseTo(0.25, 10);
    expect(by(rows, "wide").powerScore).not.toBeNull();
  });

  it("leaves a deck under the coverage bar unranked", () => {
    const rows = buildDeckPower([
      {
        name: "wide",
        windowGames: 80,
        matchups: [{ name: "small", winRate: 0.5, totalGames: 60 }],
      },
      {
        name: "small",
        windowGames: 20,
        matchups: [{ name: "wide", winRate: 0.5, totalGames: 60 }],
      },
    ]);
    expect(by(rows, "wide").fieldCoverage).toBeCloseTo(0.2, 10);
    expect(by(rows, "wide").powerScore).toBeNull();
  });

  it("scales power against the best ranked deck only", () => {
    const rows = buildDeckPower(fixture());
    // gamma's 0.6 win rate is unranked, so maxWR is alpha's 0.5567, zero sits
    // at 0.4433 and the span is 0.1133.
    expect(by(rows, "alpha").powerScore).toBeCloseTo(100, 10);
    // beta at 0.43 computes to about -11.8 and clamps.
    expect(by(rows, "beta").powerScore).toBe(0);
  });

  it("sets Frequency Score against the most played deck", () => {
    const rows = buildDeckPower(fixture());
    expect(by(rows, "alpha").freqScore).toBeCloseTo(100, 10);
    expect(by(rows, "beta").freqScore).toBeCloseTo(50, 10);
    // gamma ties alpha on windowGames, so it also reads 100 despite being unranked.
    expect(by(rows, "gamma").freqScore).toBeCloseTo(100, 10);
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
      { name: "solo", windowGames: 10, matchups: [{ name: "Total", winRate: 0.5, totalGames: 10 }] },
    ]);
    expect(rows[0].powerScore).toBeNull();
    expect(rows[0].fieldCoverage).toBe(0);
  });
});
