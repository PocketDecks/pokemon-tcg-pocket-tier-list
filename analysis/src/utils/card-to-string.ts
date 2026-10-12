import { Card } from "./types";

export const cardIdentity = (card: Card): string => {
  if (!card) {
    throw new Error("Card object is required");
  }

  let { name, set, number } = card;

  if (!name?.trim()) {
    throw new Error("Card name is required");
  }

  if (!set?.trim()) {
    throw new Error("Card set is required");
  }

  if (set === "P-B") set = "PB";
  if (set === "P-A") set = "PA";

  if (!number?.trim()) {
    throw new Error("Card number is required");
  }

  return `${name} ${set} ${number}`;
};

// Renders a card as "count name set number", throwing when a required field is missing.
const cardToString = (card: Card): string => {
  if (!card) {
    throw new Error("Card object is required");
  }

  if (typeof card.count !== "number" || card.count < 0) {
    throw new Error("Invalid card count");
  }

  return `${card.count} ${cardIdentity(card)}`;
};

export default cardToString;
