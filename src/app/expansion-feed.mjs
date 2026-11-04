import { newestExpansion } from "./expansion-policy.mjs";

const setCodeOf = (entry) => {
  const cardId = typeof entry === "string" ? entry.replace(/^\d+:/, "") : entry?.id;
  if (typeof cardId !== "string") return null;
  const dash = cardId.lastIndexOf("-");
  return dash > 0 ? cardId.slice(0, dash) : null;
};

const cardIdOf = (entry) => (typeof entry === "string" ? entry.replace(/^\d+:/, "") : entry?.id);

export const coveredCardIdsBySet = (decks) => {
  const bySet = new Map();
  if (!decks) return bySet;
  for (const deck of decks) {
    for (const entry of deck.lists ?? []) {
      for (const card of entry.cards ?? []) {
        const setCode = setCodeOf(card);
        if (!setCode) continue;
        if (!bySet.has(setCode)) bySet.set(setCode, new Set());
        bySet.get(setCode).add(cardIdOf(card));
      }
    }
  }
  return bySet;
};

export const coveredSetCodes = (decks) => new Set(coveredCardIdsBySet(decks).keys());

export const newestCoveredExpansion = (list, decks) => {
  if (!list || !decks) return null;
  const covered = coveredSetCodes(decks);
  return newestExpansion(list.filter((expansion) => covered.has(expansion.id)));
};
