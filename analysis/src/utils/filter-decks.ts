import {
  NOEX_PERCENT_CUTOFF,
  NO_TRAINER_PERCENT_CUTOFF,
  EXPANSION_RELEASE_DATE,
} from "../settings";
import { Deck } from "./types";

// Drops pre-release decks, decks from no-ex tournaments and no-trainer outliers.
export const filterDecks = (decks: Deck[]): Deck[] => {
  return decks
    .filter((deck) => new Date(deck.date) >= EXPANSION_RELEASE_DATE)
    .filter((deck) =>
      deck.cards.some(
        (card) => card.set !== "A1" && card.set !== "P-A" && card.set !== "P-B"
      )
    )
    .filter((deck) => deck.tournamentExPercent >= NOEX_PERCENT_CUTOFF)
    .filter((deck) => deck.noTrainerPercent < NO_TRAINER_PERCENT_CUTOFF)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};
