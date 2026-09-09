import { Deck } from "./types";

const convertToNames = (ids: string[], idToName: Record<string, string>) => {
  return ids.map((id) => idToName[id]).filter((name) => name);
};

// Resolves each deck's win and loss ids to names.
export const updateDeckResults = (
  decks: Deck[],
  idToName: Record<string, string>
): Deck[] => {
  return decks.map((deck) => ({
    ...deck,
    wins: convertToNames(deck.wins, idToName),
    losses: convertToNames(deck.losses, idToName),
  }));
};
