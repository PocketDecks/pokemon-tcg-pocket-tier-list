export interface ScoreBaseline {
  deckName: string;
  powerScore: number;
}

export type PowerScoredDeck = {
  name: string;
  powerScore: number | null;
};

export const sortByPowerScore = <T extends PowerScoredDeck>(
  decks: T[]
): T[] =>
  [...decks].sort(
    (a, b) => (b.powerScore ?? -1) - (a.powerScore ?? -1)
  );

export const getScoreBaseline = (
  decks: PowerScoredDeck[]
): ScoreBaseline | null => {
  const leader = sortByPowerScore(
    decks.filter(
      (deck) => deck.powerScore !== null && Number.isFinite(deck.powerScore)
    )
  )[0];

  if (!leader || leader.powerScore === null) return null;

  return {
    deckName: leader.name,
    powerScore: leader.powerScore,
  };
};

export const relativeToBaseline = (score: number, baseline: number): number => {
  if (baseline <= 0) return 0;
  return Math.max(0, Math.min(1, score / baseline));
};
