import { sortByPowerScore, type PowerScoredDeck } from "./score-baseline";

export const FREE_DECK_LIMIT = 10;

export const freeDeckNames = (decks: PowerScoredDeck[]): Set<string> =>
  new Set(sortByPowerScore(decks).slice(0, FREE_DECK_LIMIT).map((deck) => deck.name));
