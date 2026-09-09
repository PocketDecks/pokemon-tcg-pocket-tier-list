import { calculateCardScores, getCardImpactWeight } from "../utils/calculate-card-scores";
import * as settings from "../settings";
import { WINRATE_IMPORTANCE, POPULARITY_IMPORTANCE } from "../settings";

const cards = {
  "1 Cyrus A2 150": { winCount: 60, totalGames: 100 },
  "2 Poké Ball PA 5": { winCount: 30, totalGames: 100 },
};

describe("getCardImpactWeight", () => {
  afterEach(() => { (settings as any).USE_CARD_IMPACT_WEIGHTS = false; });

  it("returns 1.0 when switch off", () => {
    (settings as any).USE_CARD_IMPACT_WEIGHTS = false;
    expect(getCardImpactWeight("1 Cyrus A2 150")).toBe(1);
  });
  it("returns 1.0 for an unweighted card when switch on", () => {
    (settings as any).USE_CARD_IMPACT_WEIGHTS = true;
    expect(getCardImpactWeight("2 Poké Ball PA 5")).toBe(1);
  });
  it("returns 1.2 for Cyrus when switch on", () => {
    (settings as any).USE_CARD_IMPACT_WEIGHTS = true;
    expect(getCardImpactWeight("1 Cyrus A2 150")).toBe(1.2);
  });
  it("parses multi-word names (Lucky Ice Pop -> 1.1)", () => {
    (settings as any).USE_CARD_IMPACT_WEIGHTS = true;
    expect(getCardImpactWeight("1 Lucky Ice Pop B2 145")).toBe(1.1);
  });
});

describe("calculateCardScores with switch off (parity)", () => {
  it("matches the unweighted formula for every card", () => {
    (settings as any).USE_CARD_IMPACT_WEIGHTS = false;
    const out = calculateCardScores(cards, 200);
    // winRate ~ wilson(0.6,100); popularity ~ wilson(100/200,200). Recompute inline.
    const wilson = (p: number, n: number, z = 1.96) => {
      if (n <= 0) return 0;
      const sp = Math.max(0, Math.min(1, p));
      const d = 1 + (z * z) / n;
      const c = sp + (z * z) / (2 * n);
      const m = z * Math.sqrt((sp * (1 - sp)) / n + (z * z) / (4 * n * n));
      return Math.max(0, (c - m) / d);
    };
    const wimport = WINRATE_IMPORTANCE; // real weekly value; parity stays green as weeks pass
    const pimport = POPULARITY_IMPORTANCE;
    const exp = (winCount: number, total: number) =>
      wilson(winCount / total, total) * wimport +
      wilson(total / 200, 200) * pimport;
    expect(out["1 Cyrus A2 150"].score).toBeCloseTo(exp(60, 100), 5);
    expect(out["2 Poké Ball PA 5"].score).toBeCloseTo(exp(30, 100), 5);
  });
});
