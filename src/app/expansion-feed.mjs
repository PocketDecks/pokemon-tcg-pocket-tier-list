import { newestExpansion } from "./expansion-policy.mjs";

const setCodeOf = (entry) => {
  const cardId = cardIdOf(entry);
  if (typeof cardId !== "string") return null;
  const dash = cardId.lastIndexOf("-");
  return dash > 0 ? cardId.slice(0, dash) : null;
};

const cardIdOf = (entry) => (typeof entry === "string" ? entry.replace(/^\d+:/, "") : entry?.id);

export const bestListCards = (deck) => {
  const lists = deck.lists ?? [];
  if (lists.length === 0) return [];
  const best = [...lists].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  return best.cards ?? [];
};

export const coveredCardIdsBySet = (decks) => {
  const bySet = new Map();
  if (!decks) return bySet;
  for (const deck of decks) {
    for (const card of bestListCards(deck)) {
      const setCode = setCodeOf(card);
      if (!setCode) continue;
      if (!bySet.has(setCode)) bySet.set(setCode, new Set());
      bySet.get(setCode).add(cardIdOf(card));
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
