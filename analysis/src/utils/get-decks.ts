import { EXPANSION_RELEASE_DATE } from "../settings";
import { decksDir } from "./data-paths";
import { readDecks } from "./deck-store";
import { filterDecks } from "./filter-decks";
import { populateDeckNames } from "./populate-deck-names";
import { updateDeckResults } from "./update-deck-results";
import { Deck } from "./types";

const readDecksFromStore = (): Deck[] => {
  try {
    return readDecks(decksDir(), EXPANSION_RELEASE_DATE);
  } catch (error) {
    throw new Error(
      `Failed to read decks store: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

const calculateTotalGames = (decks: Deck[]): number => {
  return decks.reduce((acc, deck) => acc + deck.totalGames, 0);
};

// Loads decks from disk, filters them, then attaches names and results. Raw
// game counts survive: weighting happens per window downstream, where every
// in-window game counts the same.
const getDecks = (): Deck[] => {
  const rawDecks = readDecksFromStore();
  const filteredDecks = filterDecks(rawDecks);
  const { decks: decksWithNames, idToName } = populateDeckNames(filteredDecks);
  const decksWithResults = updateDeckResults(decksWithNames, idToName);

  const totalGames = calculateTotalGames(decksWithResults);
  console.log("Sample Games:", (totalGames / 2).toLocaleString());

  return decksWithResults;
};

export default getDecks;
