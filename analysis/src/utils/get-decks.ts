import fs from "fs";
import { filterDecks } from "./filter-decks";
import { populateDeckNames } from "./populate-deck-names";
import { updateDeckResults } from "./update-deck-results";
import { Deck } from "./types";

const deckFilePath = () => process.env.DECKS_FILE || "./data/decks.json";

const readDecksFromFile = (): Deck[] => {
  let decks: unknown;
  try {
    const fileContent = fs.readFileSync(deckFilePath(), "utf-8");
    decks = JSON.parse(fileContent);
  } catch (error) {
    throw new Error(
        `Failed to read decks file: ${
            error instanceof Error ? error.message : String(error)
        }`
    );
  }

  if (!Array.isArray(decks)) {
    throw new Error("Failed to read decks file: Decks data is not an array");
  }

  return decks;
};

const calculateTotalGames = (decks: Deck[]): number => {
  return decks.reduce((acc, deck) => acc + deck.totalGames, 0);
};

// Loads decks from disk, filters them, then attaches names and results. Raw
// game counts survive: weighting happens per window downstream, where every
// in-window game counts the same.
const getDecks = (): Deck[] => {
  const rawDecks = readDecksFromFile();
  const filteredDecks = filterDecks(rawDecks);
  const { decks: decksWithNames, idToName } = populateDeckNames(filteredDecks);
  const decksWithResults = updateDeckResults(decksWithNames, idToName);

  const totalGames = calculateTotalGames(decksWithResults);
  console.log("Sample Games:", (totalGames / 2).toLocaleString());

  return decksWithResults;
};

export default getDecks;
