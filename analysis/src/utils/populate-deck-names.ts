import getDeckName from "./get-deck-name";
import { Deck } from "./types";

export const populateDeckNames = (
  decks: Deck[]
): { decks: Deck[]; idToName: Record<string, string> } => {
  const idToName: Record<string, string> = {};
  const decksWithNames = [];

  for (const deck of decks) {
    const name = getDeckName(deck);
    idToName[deck.id] = name;
    decksWithNames.push({
      ...deck,
      name,
    });
  }

  return { decks: decksWithNames, idToName };
};
