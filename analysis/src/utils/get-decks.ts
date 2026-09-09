import fs from "fs";
import getMultiplier from "./get-multiplier";
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

const getNewestDate = (decks: Deck[]): Date => {
  const uniqueDates = [...new Set(decks.map((deck) => deck.date))];
  return uniqueDates.reduce(
    (newest, date) => (new Date(date) > newest ? new Date(date) : newest),
    new Date(0)
  );
};

const applyMultipliers = (decks: Deck[], newestDate: Date): Deck[] => {
  return decks.map((deck) => {
    const multiplier = getMultiplier(deck, newestDate);
    return {
      ...deck,
      totalGames: deck.totalGames * multiplier,
      winCount: deck.winCount * multiplier,
      wins: deck.wins || [],
      losses: deck.losses || [],
      multiplier,
    };
  });
};

// Loads decks from disk, filters them, attaches names and results, then applies recency multipliers.
const getDecks = (): Deck[] => {
  const rawDecks = readDecksFromFile();
  const filteredDecks = filterDecks(rawDecks);
  const { decks: decksWithNames, idToName } = populateDeckNames(filteredDecks);
  const decksWithResults = updateDeckResults(decksWithNames, idToName);

  const totalGames = calculateTotalGames(decksWithResults);
  console.log("Sample Games:", (totalGames / 2).toLocaleString());

  const newestDate = getNewestDate(decksWithResults);
  const decksWithMultipliers = applyMultipliers(decksWithResults, newestDate);

  return decksWithMultipliers;
};

export default getDecks;
