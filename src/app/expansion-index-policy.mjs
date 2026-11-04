import { coveredSetCodes, newestCoveredExpansion } from "./expansion-feed.mjs";
import { isListedExpansion } from "./expansion-policy.mjs";

export const expansionIndexPolicy = (expansions, decks) => {
  const covered = coveredSetCodes(decks);
  const newest = newestCoveredExpansion(expansions, decks);
  const ordered = expansions
    .filter((expansion) => isListedExpansion(expansion) && covered.has(expansion.id) && expansion.release_date)
    .sort((a, b) => b.release_date.localeCompare(a.release_date));
  const previous = ordered.find((expansion) => expansion.id !== newest?.id) ?? null;
  const indexable = new Set([newest?.id, previous?.id].filter(Boolean));
  return {
    newest,
    previous,
    isIndexable: (id) => indexable.has(id),
  };
};
