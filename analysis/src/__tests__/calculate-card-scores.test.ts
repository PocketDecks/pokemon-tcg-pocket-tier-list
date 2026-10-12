import { calculateCardScores } from "../utils/calculate-card-scores";

const WINRATE_ONLY = { winrateImportance: 1, popularityImportance: 0 };
const POPULARITY_ONLY = { winrateImportance: 0, popularityImportance: 1 };

const scoreOf = (
  winCount: number,
  totalGames: number,
  matchingGames: number,
  weights = WINRATE_ONLY
) => calculateCardScores({ card: { winCount, totalGames } }, matchingGames, weights).card;

describe("calculateCardScores", () => {
  it("scores a win rate with a Wilson lower bound", () => {
    expect(scoreOf(50, 100, 1000).score).toBeCloseTo(0.4038, 3);
  });

  it("trusts a larger sample more at the same win rate", () => {
    expect(scoreOf(500, 1000, 1000).score).toBeGreaterThan(scoreOf(50, 100, 1000).score);
    expect(scoreOf(500, 1000, 1000).score).toBeLessThan(0.5);
  });

  it("scores a card nobody won with as zero", () => {
    expect(scoreOf(0, 100, 1000).score).toBe(0);
  });

  it("returns zero for a card with no games", () => {
    expect(scoreOf(0, 0, 1000).score).toBe(0);
  });

  it("scores popularity as the card's share of the archetype's games", () => {
    const small = scoreOf(10, 100, 1000, POPULARITY_ONLY);
    const large = scoreOf(10, 500, 1000, POPULARITY_ONLY);
    expect(large.popularity).toBeGreaterThan(small.popularity);
    expect(large.score).toBe(large.popularity);
  });

  it("blends win rate and popularity by the given weights", () => {
    const winOnly = scoreOf(50, 100, 1000, WINRATE_ONLY).score;
    const popularityOnly = scoreOf(50, 100, 1000, POPULARITY_ONLY).score;
    const blended = scoreOf(50, 100, 1000, {
      winrateImportance: 0.75,
      popularityImportance: 0.25,
    }).score;
    expect(blended).toBeCloseTo(0.75 * winOnly + 0.25 * popularityOnly, 12);
  });

  it("keeps the input counts on each scored card", () => {
    expect(scoreOf(5, 10, 100)).toMatchObject({ winCount: 5, totalGames: 10 });
  });

  it("rejects an archetype with no games", () => {
    expect(() => calculateCardScores({}, 0, WINRATE_ONLY)).toThrow(
      "Total matching games must be greater than 0"
    );
  });
});
