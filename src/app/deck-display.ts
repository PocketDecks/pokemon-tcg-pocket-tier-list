import type { CardType } from "./cards-api";
import { friendlyName } from "./deck-friendly-name";

/** Anything carrying a pipeline deck name, with or without resolved icons. */
export interface NamedDeck {
  name: string;
  iconPrimary?: CardType | null;
  iconSecondary?: CardType | null;
}

/** "mega-lucario-ex-b3-081" -> "Mega Lucario Ex B3 081". */
export const formatArchetypeId = (id: string): string =>
  id.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

/**
 * The name to show a user for a deck. Falls back to the formatted archetype id
 * so a deck whose icons never resolved still reads as words, never as a raw id.
 */
export const deckDisplayName = (deck: NamedDeck): string =>
  [deck.iconPrimary?.name, deck.iconSecondary?.name]
    .filter(Boolean)
    .join(" / ") || formatArchetypeId(deck.name);

export const variantDisplayName = (name: string, deck?: NamedDeck | null): string =>
  deck?.iconPrimary
    ? deckDisplayName(deck)
    : friendlyName(name).split(" & ").join(" / ");
