import { comparePowerDescending, rankedDecks, sortRanked } from "./ranked-deck";

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
  [...decks].sort(comparePowerDescending);

export const getScoreBaseline = (
  decks: PowerScoredDeck[]
): ScoreBaseline | null => {
  const leader = sortRanked(
    rankedDecks(decks).filter((deck) => Number.isFinite(deck.powerScore))
  )[0];

  if (!leader) return null;

  return {
    deckName: leader.name,
    powerScore: leader.powerScore,
  };
};

export const relativeToBaseline = (score: number, baseline: number): number => {
  if (baseline <= 0) return 0;
  return Math.max(0, Math.min(1, score / baseline));
};
