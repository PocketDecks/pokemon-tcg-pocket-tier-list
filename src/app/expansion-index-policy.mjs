import { coveredCardIdsBySet } from "./expansion-feed.mjs";
import { isListedExpansion, newestExpansion } from "./expansion-policy.mjs";

export const MIN_INDEXED_EXPANSION_CARDS = 5;

export const expansionIndexPolicy = (expansions, decks) => {
  const cardsBySet = coveredCardIdsBySet(decks);
  const hasEnoughCards = (expansion) => (cardsBySet.get(expansion.id)?.size ?? 0) >= MIN_INDEXED_EXPANSION_CARDS;
  const newest = newestExpansion(expansions.filter((expansion) => cardsBySet.has(expansion.id)));
  const ordered = expansions
    .filter((expansion) => isListedExpansion(expansion) && cardsBySet.has(expansion.id) && expansion.release_date)
    .sort((a, b) => b.release_date.localeCompare(a.release_date));
  // A newer set with a card or two in the rankings must not displace an earlier
  // set that is well covered, so "previous" skips sets under the minimum.
  const previous = ordered.find((expansion) => expansion.id !== newest?.id && hasEnoughCards(expansion)) ?? null;
  const indexable = new Set(
    [newest, previous].filter((expansion) => expansion && hasEnoughCards(expansion)).map((expansion) => expansion.id)
  );
  return {
    newest,
    previous,
    isIndexable: (id) => indexable.has(id),
  };
};
