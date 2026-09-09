import {
  WINRATE_IMPORTANCE,
  POPULARITY_IMPORTANCE,
  USE_CARD_IMPACT_WEIGHTS,
  CARD_IMPACT_WEIGHTS,
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

// Wilson lower-bound shrinkage: pulls a proportion toward 0 harder as its effective sample size shrinks, so tiny archetypes don't look as confident as large ones (returns 0 when n <= 0).
const wilsonLowerBound = (p: number, n: number, z = 1.96): number => {
  if (n <= 0) return 0;
  const safeP = Math.max(0, Math.min(1, p));
  const denom = 1 + (z * z) / n;
  const center = safeP + (z * z) / (2 * n);
  const margin = z * Math.sqrt((safeP * (1 - safeP)) / n + (z * z) / (4 * n * n));
  return Math.max(0, (center - margin) / denom);
};

// Scores one card from its win rate and popularity, both shrunk by a Wilson bound so small samples don't saturate.
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

  const weight = getCardImpactWeight(cardName); // reads the switch + map
  return {
    score:
      (winRate * WINRATE_IMPORTANCE + popularity * POPULARITY_IMPORTANCE) *
      weight,
    popularity,
  };
};

// Parses the card NAME from a cardToString key and returns its weight (1.0 default).
export const getCardImpactWeight = (cardKey: string): number => {
  if (!USE_CARD_IMPACT_WEIGHTS) return 1;
  const name = cardKey.split(" ").slice(1, -2).join(" ");
  return CARD_IMPACT_WEIGHTS[name] ?? 1;
};

// Scores every card in a record from its win rate and the archetype's qualified game total.
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
