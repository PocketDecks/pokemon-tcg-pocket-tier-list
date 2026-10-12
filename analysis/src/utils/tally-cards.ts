import cardToString from "./card-to-string";
import { Deck } from "./types";

export interface CardTally {
  winCount: number;
  totalGames: number;
}

export const tallyCards = (decks: readonly Deck[]): Record<string, CardTally> => {
  const tally: Record<string, CardTally> = {};
  for (const deck of decks) {
    for (const card of deck.cards) {
      const cardName = cardToString(card);
      const entry = tally[cardName] ?? { winCount: 0, totalGames: 0 };
      entry.winCount += deck.winCount;
      entry.totalGames += deck.totalGames;
      tally[cardName] = entry;
    }
  }
  return tally;
};
