import { Card, Deck } from "./types";
import cardToString from "./card-to-string";
import {
  WINRATE_IMPORTANCE,
  POPULARITY_IMPORTANCE,
  CARDS_IN_DECK,
} from "../settings";

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
      const cardKey = cardToString(card);
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
  totalGames: number
): DeckScore => {
  if (totalGames <= 0) {
    throw new Error("Total games must be greater than 0");
  }

  const popularity = matchingGames / totalGames;
  const cardScore = calculateCardScore(deck.cards, cardStats);

  return {
    score: cardScore * WINRATE_IMPORTANCE + popularity * POPULARITY_IMPORTANCE,
    popularity,
    strength: cardScore,
  };
};
