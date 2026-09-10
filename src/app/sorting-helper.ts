import { SortBy } from "../components/FilterContext";
import { MatchupType } from "../contexts/DecksContext";
import { FullDeckType } from "../contexts/DecksContext";

export const getSortValue = (deck: FullDeckType, sortBy: SortBy): number => {
  if (sortBy === SortBy.SCORE) return deck.score;
  if (sortBy === SortBy.POPULARITY) return deck.popularity;
  if (sortBy === SortBy.STRENGTH) return deck.strength;
  if (sortBy === SortBy.WIN_RATE) {
    return deck.matchups.find((m: MatchupType) => m.name === "Total")?.winRate ?? 0;
  }
  // Unranked decks have no Power or Meta score. -1 sinks them below every
  // ranked deck instead of letting a null read as 0, which would place them
  // level with the genuinely worst-performing decks.
  if (sortBy === SortBy.POWER) return deck.powerScore ?? -1;
  if (sortBy === SortBy.META) return deck.metaScore ?? -1;
  return 0;
};
