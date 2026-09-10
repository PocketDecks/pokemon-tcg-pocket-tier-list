import crypto from "crypto";
import { Deck } from "./types";

// Hashes a deck's card list to a stable id, ignoring card order.
const getId = (deck: Deck) => {
  const cards = deck.cards.map(
    (card) => `${card.count}-${card.name}-${card.set}-${card.number}`
  );
  const deckString = cards.sort().join(",");
  return crypto.createHash("sha256").update(deckString).digest("hex");
};

export default getId;
