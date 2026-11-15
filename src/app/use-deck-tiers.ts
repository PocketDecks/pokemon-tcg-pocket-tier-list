import { useMemo } from "react";
import { buildTiers } from "./tier-helper";
import type { FullDeckType } from "./deck-types";
import { rankedDecks, type RankedDeck } from "./ranked-deck";

export interface DeckTier {
  label: string;
  color: string;
  decks: RankedDeck<FullDeckType>[];
}

export const rankDeckTiers = (decks: FullDeckType[] | null): DeckTier[] => {
  if (!decks) return [];
  return buildTiers(rankedDecks(decks), (deck) => deck.powerScore).map((tier) => ({ label: tier.label, color: tier.color, decks: tier.data }));
};

export const tierForDeck = (tiers: DeckTier[], deckId: string): DeckTier | null =>
  tiers.find((tier) => tier.decks.some((deck) => deck.id === deckId)) ?? null;

const useDeckTiers = (decks: FullDeckType[] | null): DeckTier[] =>
  useMemo(() => rankDeckTiers(decks), [decks]);

export default useDeckTiers;
