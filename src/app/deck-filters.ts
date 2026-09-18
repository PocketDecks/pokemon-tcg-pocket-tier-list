import { CardType } from "./cards-api";
import { parseDeckListRef } from "./card-ref";

export { deckNameToIconIds } from "../types/deck-name";

export type CardsMapping = Record<string, CardType>;

export const cardToId = (card: string): string => parseDeckListRef(card).id;

export const cardToCount = (card: string): number =>
  parseDeckListRef(card).count;

/** Cards and deck lists are versioned separately, so ids can fall out of step. */
export const findUnresolvedCardIds = (
  cards: string[],
  cardsMapping: CardsMapping
): string[] => {
  return cards
    .map(cardToId)
    .filter((id: string) => !cardsMapping[id]);
};

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
  cardsMapping: CardsMapping,
  energy: string | null
): boolean => {
  if (energy === null) return true;
  return cards.every((card: string) => {
    const cardData = cardsMapping[cardToId(card)];
    return cardData.type === energy || cardData.supertype === "Trainer";
  });
};

export const matchesExFilter = (
  cards: string[],
  cardsMapping: CardsMapping,
  includeEx: boolean
): boolean => {
  if (includeEx) return true;
  return cards.every((card: string) => {
    const cardData = cardsMapping[cardToId(card)];
    return cardData.supertype === "Trainer" || !cardData.ex;
  });
};

export const hasEnoughLatestExpansionCards = (
  cards: string[],
  cardsMapping: CardsMapping,
  latestExpansionId: string | null,
  required: number | null
): boolean => {
  if (required === null || latestExpansionId === null) return true;

  let count = 0;
  for (const card of cards) {
    const cardData = cardsMapping[cardToId(card)];
    if (cardData.id.split("-")[0] === latestExpansionId) {
      count += cardToCount(card);
    }
  }
  return count >= required;
};
