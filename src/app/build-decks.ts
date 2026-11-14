import { CARDS_BY_ID } from "./cards-api";
import type { FullDeckType } from "./deck-types";
import {
  deckNameToIconIds,
  findUnresolvedCardIds,
  hasEnoughLatestExpansionCards,
  isAffordable,
  matchesEnergy,
  matchesExFilter,
} from "./deck-filters";
import { resolveDeck } from "./deck-resolution";
import { getSortValue } from "./sorting-helper";
import type { SortBy } from "./sort-by";
import type { PipelineDeckList, PipelinePartialDeck } from "../types/pipeline-data";

export interface BuildOptions {
  missingCounts: Record<string, number>;
  energy: string | null;
  includeEx: boolean;
  deckAmount: number;
  sortBy: SortBy;
  latestExpansionId: string | null;
  latestExpansionCards: number | null;
  // The legacy tier list keeps decks through the last paired ("&") entry.
  // Detail pages link straight to pairs, so their view must not trim them.
  applyPairedTrim: boolean;
}

const trimPairedDecks = (fullDecks: FullDeckType[]): FullDeckType[] => {
  const lastPairedIndex = fullDecks.findLastIndex(
    (deck: FullDeckType) => deck.name.includes("&")
  );
  if (lastPairedIndex === -1) return fullDecks;
  return fullDecks.slice(0, lastPairedIndex + 1);
};

export const buildDecks = (
  decks: PipelinePartialDeck[],
  options: BuildOptions
): FullDeckType[] => {
  const {
    missingCounts,
    energy,
    includeEx,
    deckAmount,
    sortBy,
    latestExpansionId,
    latestExpansionCards,
    applyPairedTrim,
  } = options;

  const unresolvedCardIds = new Set<string>();
  const canResolveIcon = (id: string): boolean => {
    if (CARDS_BY_ID.has(id)) return true;
    unresolvedCardIds.add(id);
    return false;
  };

  const decksFiltered = decks
    .map((deck) => {
      const filteredLists = deck.lists
        .filter((list: PipelineDeckList) => {
          const unresolved = findUnresolvedCardIds(list.cards);
          unresolved.forEach((id: string) => unresolvedCardIds.add(id));
          return unresolved.length === 0;
        })
        .filter((list: PipelineDeckList) =>
          isAffordable(list.cards, missingCounts)
        )
        .filter((list: PipelineDeckList) => matchesEnergy(list.cards, energy))
        .filter((list: PipelineDeckList) => matchesExFilter(list.cards, includeEx))
        .filter((list: PipelineDeckList) =>
          hasEnoughLatestExpansionCards(
            list.cards,
            latestExpansionId,
            latestExpansionCards
          )
        );

      return { ...deck, lists: filteredLists };
    })
    .filter((deck) => deck.lists.length > 0)
    .filter((deck) => canResolveIcon(deckNameToIconIds(deck.name)[0]))
    .sort((a, b) => b.percentOfGames - a.percentOfGames)
    .slice(0, deckAmount);

  const resolved = decksFiltered.map((raw) => ({
    raw,
    deck: resolveDeck(raw, raw.lists),
  }));
  const highestPopularity = Math.max(0, ...decksFiltered.map((deck) => deck.popularity));
  const highestStrength = Math.max(0, ...resolved.map(({ deck }) => deck.strength));

  const fullDecks = resolved
    .map(({ raw, deck }): FullDeckType => ({
      ...deck,
      popularity: highestPopularity > 0 ? raw.popularity / highestPopularity : 0,
      strength: highestStrength > 0 ? deck.strength / highestStrength : 0,
      percentOfGames: raw.percentOfGames,
    }))
    .sort((a, b) => getSortValue(b, sortBy) - getSortValue(a, sortBy));

  if (unresolvedCardIds.size > 0) {
    console.warn(
      `Skipped decks referencing ${unresolvedCardIds.size} card id(s) missing from the card data: ${Array.from(
        unresolvedCardIds
      ).join(", ")}`
    );
  }

  if (!applyPairedTrim) return fullDecks;
  return trimPairedDecks(fullDecks);
};
