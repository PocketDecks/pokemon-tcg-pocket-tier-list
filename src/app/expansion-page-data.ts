import type { CardType } from "./cards-api";
import type { ExpansionType } from "./use-expansions";
import type { FullDeckType } from "./deck-types";
import { coveredSetCodes } from "./expansion-feed.mjs";

export interface ExpansionLiveCard extends CardType {
  cardNumber: string;
}

export interface ExpansionLiveDeck {
  deck: FullDeckType;
  displayName: string;
}

export const expansionPageData = (
  expansion: ExpansionType,
  cards: CardType[],
  decks: FullDeckType[],
  displayName: (deck: FullDeckType) => string
) => {
  const expansionCards = new Map(
    cards
      .filter((card) => card.set === expansion.id)
      .map((card) => [card.id, { ...card, cardNumber: card.id.slice(card.id.lastIndexOf("-") + 1) }])
  );
  const liveDecks = decks
    .filter((deck) => coveredSetCodes([{ lists: [deck.bestList] }]).has(expansion.id))
    .map((deck) => ({ deck, displayName: displayName(deck) }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  const used = new Set(
    liveDecks.flatMap(({ deck }) =>
      deck.bestList.cards
        .map((card) => card.id)
        .filter((id) => expansionCards.has(id))
    )
  );
  return {
    cards: [...used]
      .map((id) => expansionCards.get(id))
      .filter((card): card is ExpansionLiveCard => card !== undefined)
      .sort((a, b) => a.cardNumber.localeCompare(b.cardNumber, undefined, { numeric: true })),
    decks: liveDecks,
  };
};
