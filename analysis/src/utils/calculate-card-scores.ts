import {
  WINRATE_IMPORTANCE,
  POPULARITY_IMPORTANCE,
} from "../settings";

interface CardData {
  winCount: number;
  totalGames: number;
  score?: number;
}

interface CardScore extends Omit<CardData, "score"> {
  score: number;
  popularity: number;
}

/**
 * Wilson-style shrinkage estimator: given an observed proportion `p` and
 * an effective sample size `n`, returns a value <= `p` that pulls toward 0
 * harder when `n` is small. Used to keep card stats from a tiny archetype
 * from looking as confidently good as the same stats from a large one.
 *
 * Formally this is the Wilson score interval lower bound for a binomial
 * proportion at confidence level `z` (default z=1.96 ≈ 95%). In this
 * pipeline the inputs are recency-weighted (and therefore non-integer)
 * game counts, so `n` is treated as an effective sample size rather than
 * a strict binomial trial count, and the result should be read as a
 * sample-size-aware shrinkage rather than a true CI bound. Returns 0 if
 * `n` <= 0.
 */
const wilsonLowerBound = (p: number, n: number, z = 1.96): number => {
  if (n <= 0) return 0;
  const safeP = Math.max(0, Math.min(1, p));
  const denom = 1 + (z * z) / n;
  const center = safeP + (z * z) / (2 * n);
  const margin = z * Math.sqrt((safeP * (1 - safeP)) / n + (z * z) / (4 * n * n));
  return Math.max(0, (center - margin) / denom);
};

/**
 * Calculates the score for a single card based on its win rate, popularity, and type.
 *
 * Both the per-card win rate (over the card's appearances) and the per-card
 * popularity (over the archetype's qualified games) are passed through a
 * Wilson lower bound so that small samples within a tiny archetype don't
 * artificially saturate at 1.0.
 */
const calculateSingleCardScore = (
  cardName: string,
  { winCount, totalGames }: CardData,
  totalMatchingGames: number
): { score: number; popularity: number } => {
  const rawWinRate = totalGames > 0 ? winCount / totalGames : 0;
  const rawPopularity =
    totalMatchingGames > 0 ? totalGames / totalMatchingGames : 0;

  // Sample-size-aware versions: small samples shrink toward zero.
  const winRate = wilsonLowerBound(rawWinRate, totalGames);
  const popularity = wilsonLowerBound(rawPopularity, totalMatchingGames);

  return {
    score: winRate * WINRATE_IMPORTANCE + popularity * POPULARITY_IMPORTANCE,
    popularity,
  };
};

/**
 * Calculates scores for all cards based on their win rates and popularity
 * @param cards - Record of card data containing win counts and total games
 * @param matchingGames - Total number of games to calculate popularity against
 * @returns Record of cards with calculated scores
 */
export const calculateCardScores = (
  cards: Record<string, CardData>,
  matchingGames: number
): Record<string, CardScore> => {
  if (matchingGames <= 0) {
    throw new Error("Total matching games must be greater than 0");
  }

  return Object.entries(cards).reduce<Record<string, CardScore>>(
    (result, [cardName, cardData]) => {
      result[cardName] = {
        ...cardData,
        ...calculateSingleCardScore(cardName, cardData, matchingGames),
      };
      return result;
    },
    {}
  );
};
