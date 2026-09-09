import {
  NOEX,
  NOEX_PERCENT_CUTOFF,
  NO_TRAINER_PERCENT_CUTOFF,
  MAX_DECKS_TO_ANALYZE,
  EXPANSION_RELEASE_DATE,
} from "../settings";
import { Deck } from "./types";

// Drops decks from before the expansion release, resolves the NOEX toggle
// (drop ex-less when off, require ex-less when on), filters no-trainer
// outliers, and caps the deck count.
export const filterDecks = (decks: Deck[]): Deck[] => {
  return decks
    .filter((deck) => new Date(deck.date) >= EXPANSION_RELEASE_DATE)
    .filter(
      (deck) => !deck.cards.some((card) => card.name.endsWith(" ex")) || !NOEX
    )
    .filter((deck) =>
      deck.cards.some(
        (card) => card.set !== "A1" && card.set !== "P-A" && card.set !== "P-B"
      )
    )
    .filter((deck) => {
      const isNoEx = deck.tournamentExPercent < NOEX_PERCENT_CUTOFF;
      return isNoEx === NOEX;
    })
    .filter((deck) => deck.noTrainerPercent < NO_TRAINER_PERCENT_CUTOFF)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, MAX_DECKS_TO_ANALYZE);
};
