export interface ScoreBaseline {
  deckName: string;
  powerScore: number;
  cardStrength: number;
}

export type PowerScoredDeck = {
  name: string;
  powerScore: number | null;
  lists: { score: number; strength: number }[];
};

const maxListValue = (
  deck: PowerScoredDeck,
  field: "score" | "strength"
): number => Math.max(0, ...deck.lists.map((list) => list[field]));

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
    cardStrength: maxListValue(leader, "strength"),
  };
};

export const relativeToBaseline = (score: number, baseline: number): number => {
  if (baseline <= 0) return 0;
  return Math.max(0, Math.min(1, score / baseline));
};
