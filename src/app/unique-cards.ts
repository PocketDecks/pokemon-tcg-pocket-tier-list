export const uniqueCardsById = <T extends { id: string }>(cards: readonly T[]): T[] =>
  cards.filter((card, index) => cards.findIndex((other) => other.id === card.id) === index);
