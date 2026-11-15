import { CARDS_BY_ID, type CardType } from "./cards-api";
import { parseDeckListRef } from "./card-ref";

export { deckNameToIconIds } from "../types/deck-name";

export const cardToId = (card: string): string => parseDeckListRef(card).id;

export const cardToCount = (card: string): number =>
  parseDeckListRef(card).count;

/** Cards and deck lists are versioned separately, so ids can fall out of step. */
export const findUnresolvedCardIds = (cards: string[]): string[] =>
  cards.map(cardToId).filter((id: string) => !CARDS_BY_ID.has(id));

/** Only for lists that passed findUnresolvedCardIds. */
const cardOf = (card: string): CardType =>
  CARDS_BY_ID.get(cardToId(card)) as CardType;

/** A card is capped at 2 copies, less whatever the user is missing. */
export const isAffordable = (
  cards: string[],
  missingCounts: Record<string, number>
): boolean => {
  for (const card of cards) {
    const id = cardToId(card);
    if (missingCounts[id]) {
      if (cardToCount(card) > 2 - missingCounts[id]) return false;
    }
  }
  return true;
};

/** Trainers carry no elemental type, so they pass every energy filter. */
export const matchesEnergy = (
  cards: string[],
  energy: string | null
): boolean => {
  if (energy === null) return true;
  return cards.every((card: string) => {
    const cardData = cardOf(card);
    return cardData.type === energy || cardData.supertype === "Trainer";
  });
};

export const matchesExFilter = (
  cards: string[],
  includeEx: boolean
): boolean => {
  if (includeEx) return true;
  return cards.every((card: string) => {
    const cardData = cardOf(card);
    return cardData.supertype === "Trainer" || !cardData.ex;
  });
};

export const hasEnoughLatestExpansionCards = (
  cards: string[],
  latestExpansionId: string | null,
  required: number | null
): boolean => {
  if (required === null || latestExpansionId === null) return true;

  let count = 0;
  for (const card of cards) {
    if (cardToId(card).split("-")[0] === latestExpansionId) {
      count += cardToCount(card);
    }
  }
  return count >= required;
};
