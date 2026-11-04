import type { CardType } from "./cards-api";
import type { ExpansionType } from "./use-expansions";
import type { FullDeckType } from "./deck-types";
import { bestListCardIds } from "./expansion-feed.mjs";
import { deckSlug } from "./deck-slug";
import { deckArchetypeSlug } from "./deck-archetype";
import { deckDisplayName } from "./deck-display";

export interface ExpansionLiveCard extends CardType {
  cardNumber: string;
}

export interface ExpansionLiveDeck {
  name: string;
  hub: string;
  deck: FullDeckType | null;
  displayName: string;
}

interface RawDeck {
  name: string;
  lists?: readonly { score?: number; cards?: readonly unknown[] }[];
}

export const packSlug = (expansionId: string, packId: string) => packId.slice(expansionId.length + 1);

export const packNameForSlug = (expansion: ExpansionType, slug: string | null): string | null => {
  if (!slug || expansion.packs.length < 2) return null;
  return expansion.packs.find((pack) => packSlug(expansion.id, pack.id) === slug)?.name ?? null;
};

const inPack = (card: CardType, packName: string) =>
  card.pack === packName || card.pack.toLowerCase().includes("shared");

export const expansionPageData = (
  expansion: ExpansionType,
  cards: CardType[],
  rawDecks: readonly RawDeck[],
  resolvedDecks: readonly FullDeckType[],
  packName?: string
) => {
  const activePack =
    expansion.packs.length > 1 && expansion.packs.some((pack) => pack.name === packName) ? packName : undefined;
  const expansionCards = new Map(
    cards
      .filter((card) => card.set === expansion.id && (activePack === undefined || inPack(card, activePack)))
      .map((card) => [card.id, { ...card, cardNumber: card.id.slice(card.id.lastIndexOf("-") + 1) }])
  );
  const qualifying = rawDecks.filter((deck) => bestListCardIds(deck).some((id) => expansionCards.has(id)));
  const liveDecks: ExpansionLiveDeck[] = qualifying
    .map((raw) => {
      const deck = resolvedDecks.find((candidate) => candidate.id === deckSlug(raw.name)) ?? null;
      return {
        name: raw.name,
        hub: deckArchetypeSlug(raw.name),
        deck,
        displayName: deckDisplayName(deck ?? { name: raw.name }),
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  const used = new Set(
    qualifying.flatMap((deck) => bestListCardIds(deck)).filter((id) => expansionCards.has(id))
  );
  return {
    cards: [...used]
      .map((id) => expansionCards.get(id))
      .filter((card): card is ExpansionLiveCard => card !== undefined)
      .sort((a, b) => a.cardNumber.localeCompare(b.cardNumber, undefined, { numeric: true })),
    decks: liveDecks,
  };
};
