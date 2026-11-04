import { coveredCardIdsBySet, newestCoveredExpansion } from "./expansion-feed.mjs";
import { isListedExpansion } from "./expansion-policy.mjs";

export const MIN_INDEXED_EXPANSION_CARDS = 5;

export const expansionIndexPolicy = (expansions, decks) => {
  const cardsBySet = coveredCardIdsBySet(decks);
  const newest = newestCoveredExpansion(expansions, decks);
  const ordered = expansions
    .filter((expansion) => isListedExpansion(expansion) && cardsBySet.has(expansion.id) && expansion.release_date)
    .sort((a, b) => b.release_date.localeCompare(a.release_date));
  const previous = ordered.find((expansion) => expansion.id !== newest?.id) ?? null;
  const hasEnoughCards = (expansion) => (cardsBySet.get(expansion.id)?.size ?? 0) >= MIN_INDEXED_EXPANSION_CARDS;
  const indexable = new Set(
    [newest, previous].filter((expansion) => expansion && hasEnoughCards(expansion)).map((expansion) => expansion.id)
  );
  return {
    newest,
    previous,
    isIndexable: (id) => indexable.has(id),
  };
};
