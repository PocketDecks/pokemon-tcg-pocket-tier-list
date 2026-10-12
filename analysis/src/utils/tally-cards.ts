import { cardIdentity } from "./card-to-string";
import { Deck } from "./types";

export interface CardTally {
  winCount: number;
  totalGames: number;
  copies: Record<number, number>;
}

export const tallyCards = (decks: readonly Deck[]): Record<string, CardTally> => {
  const tally: Record<string, CardTally> = {};
  for (const deck of decks) {
    for (const card of deck.cards) {
      const identity = cardIdentity(card);
      const entry = (tally[identity] ??= { winCount: 0, totalGames: 0, copies: {} });
      entry.winCount += deck.winCount;
      entry.totalGames += deck.totalGames;
      entry.copies[card.count] = (entry.copies[card.count] ?? 0) + deck.totalGames;
    }
  }
  return tally;
};

export const modalCopies = (tally: CardTally): number => {
  let best = 0;
  let bestGames = -1;
  for (const [copies, games] of Object.entries(tally.copies)) {
    const count = Number(copies);
    if (games > bestGames || (games === bestGames && count < best)) {
      best = count;
      bestGames = games;
    }
  }
  return best;
};
