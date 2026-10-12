import { Card, Deck } from "./types";
import { cardIdentity } from "./card-to-string";
import { CARDS_IN_DECK, ScoringWeights } from "../settings";

interface CardStats {
  winCount: number;
  totalGames: number;
  score?: number;
}

// Sums each card's score weighted by its count, normalised over a full deck.
const calculateCardScore = (
  cards: Card[],
  cardStats: Record<string, CardStats>
): number => {
  return (
    cards.reduce((totalScore, card) => {
      const cardKey = cardIdentity(card);
      const cardScore = cardStats[cardKey]?.score || 0;
      return totalScore + cardScore * card.count;
    }, 0) / CARDS_IN_DECK
  );
};

// Composite score for one deck: card strength and popularity blended by their configured weights.
export interface DeckScore {
  score: number;
  popularity: number;
  strength: number;
}

// Scores a deck from its cards, qualified games, and the dataset total.
export const calculateDeckScore = (
  deck: Deck,
  cardStats: Record<string, CardStats>,
  matchingGames: number,
  totalGames: number,
  weights: ScoringWeights
): DeckScore => {
  if (totalGames <= 0) {
    throw new Error("Total games must be greater than 0");
  }

  const popularity = matchingGames / totalGames;
  const cardScore = calculateCardScore(deck.cards, cardStats);

  return {
    score:
      cardScore * weights.winrateImportance +
      popularity * weights.popularityImportance,
    popularity,
    strength: cardScore,
  };
};
