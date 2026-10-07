import { useMemo } from "react";
import { buildTiers } from "./tier-helper";
import type { FullDeckType } from "./deck-types";

export interface DeckTier {
  label: string;
  color: string;
  decks: FullDeckType[];
}

export const rankDeckTiers = (decks: FullDeckType[] | null): DeckTier[] => {
  if (!decks) return [];
  return buildTiers(
    decks.filter((deck) => deck.powerScore !== null),
    (deck) => deck.powerScore ?? -1
  ).map((tier) => ({ label: tier.label, color: tier.color, decks: tier.data }));
};

export const tierForDeck = (tiers: DeckTier[], deckId: string): DeckTier | null =>
  tiers.find((tier) => tier.decks.some((deck) => deck.id === deckId)) ?? null;

const useDeckTiers = (decks: FullDeckType[] | null): DeckTier[] =>
  useMemo(() => rankDeckTiers(decks), [decks]);

export default useDeckTiers;
