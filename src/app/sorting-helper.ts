import { SortBy } from "../app/sort-by";
import { FullDeckType } from "../app/deck-types";
import { UNRANKED_SORT_VALUE } from "./ranked-deck";

export const getSortValue = (deck: FullDeckType, sortBy: SortBy): number => {
  if (sortBy === SortBy.SCORE) return deck.score;
  if (sortBy === SortBy.POPULARITY) return deck.popularity;
  if (sortBy === SortBy.STRENGTH) return deck.strength;
  if (sortBy === SortBy.POWER) return deck.powerScore ?? UNRANKED_SORT_VALUE;
  if (sortBy === SortBy.META) return deck.metaScore ?? UNRANKED_SORT_VALUE;
  return 0;
};
