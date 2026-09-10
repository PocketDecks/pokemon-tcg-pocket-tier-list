interface LimitlessCardType {
  count: number;
  name: string;
  set: string;
  number: string;
}

const setCode = (set: string): string => {
  if (set === "P-A") return "pa";
  if (set === "P-B") return "pb";
  return set.toLowerCase();
};

const cardToId = (card: LimitlessCardType): string => {
  return `${card.count}:${setCode(card.set)}-${card.number.padStart(3, "0")}`;
};

// Maps raw Limitless cards to canonical "count:set-number" ids used downstream.
export const convertCardsToIds = (cards: LimitlessCardType[]): string[] => {
  return cards.map((card) => cardToId(card));
};
