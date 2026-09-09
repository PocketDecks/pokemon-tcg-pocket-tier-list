import { Card } from "./types";

// Renders a card as "count name set number", throwing when a required field is missing.
const cardToString = (card: Card): string => {
  if (!card) {
    throw new Error("Card object is required");
  }

  let { count, name, set, number } = card;

  if (typeof count !== "number" || count < 0) {
    throw new Error("Invalid card count");
  }

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

  return `${count} ${name} ${set} ${number}`;
};

export default cardToString;
