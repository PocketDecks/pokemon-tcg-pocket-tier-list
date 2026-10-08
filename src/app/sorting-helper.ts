import { SortBy } from "../app/sort-by";
import { FullDeckType } from "../app/deck-types";

export const getSortValue = (deck: FullDeckType, sortBy: SortBy): number => {
  if (sortBy === SortBy.SCORE) return deck.score;
  if (sortBy === SortBy.POPULARITY) return deck.popularity;
  if (sortBy === SortBy.STRENGTH) return deck.strength;
  // Unranked decks have no Power or Meta score. -1 sinks them below every
  // ranked deck instead of letting a null read as 0, which would place them
  // level with the genuinely worst-performing decks.
  if (sortBy === SortBy.POWER) return deck.powerScore ?? -1;
  if (sortBy === SortBy.META) return deck.metaScore ?? -1;
  return 0;
};
