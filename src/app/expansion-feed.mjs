import { newestExpansion } from "./expansion-policy.mjs";

const setCodeOf = (entry) => {
  const cardId = typeof entry === "string" ? entry.replace(/^\d+:/, "") : entry?.id;
  if (typeof cardId !== "string") return null;
  const dash = cardId.lastIndexOf("-");
  return dash > 0 ? cardId.slice(0, dash) : null;
};

export const coveredSetCodes = (decks) => {
  if (!decks) return new Set();
  return new Set(
    decks
      .flatMap((deck) => (deck.lists ?? []).flatMap((entry) => (entry.cards ?? []).map(setCodeOf)))
      .filter(Boolean)
  );
};

export const newestCoveredExpansion = (list, decks) => {
  if (!list || !decks) return null;
  const covered = coveredSetCodes(decks);
  return newestExpansion(list.filter((expansion) => covered.has(expansion.id)));
};
