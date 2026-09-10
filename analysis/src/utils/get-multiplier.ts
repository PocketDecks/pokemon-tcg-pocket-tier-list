import {
  OLD_MULTIPLIER,
  NEW_MULTIPLIER,
  EXPANSION_RELEASE_DATE,
} from "../settings";
import { Deck } from "./types";

// Recency multiplier for a deck: newer decks scale up toward NEW_MULTIPLIER.
const getMultiplier = (game: Deck, newestDate: Date) => {
  const deckDate = new Date(game.date);
  const timePassed = deckDate.getTime() - EXPANSION_RELEASE_DATE.getTime();
  const totalTime = newestDate.getTime() - EXPANSION_RELEASE_DATE.getTime();
  const datePercentage = totalTime > 0 ? timePassed / totalTime : 1;
  return datePercentage * (NEW_MULTIPLIER - OLD_MULTIPLIER) + OLD_MULTIPLIER;
};

export default getMultiplier;
