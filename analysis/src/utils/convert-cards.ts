import { setCode } from "../../../src/app/card-ref";

interface LimitlessCardType {
  count: number;
  name: string;
  set: string;
  number: string;
}

const cardToId = (card: LimitlessCardType): string => {
  return `${card.count}:${setCode(card.set)}-${card.number.padStart(3, "0")}`;
};

// Maps raw Limitless cards to canonical "count:set-number" ids used downstream.
export const convertCardsToIds = (cards: LimitlessCardType[]): string[] => {
  return cards.map((card) => cardToId(card));
};
