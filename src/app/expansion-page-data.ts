import type { CardType } from "./cards-api";
import type { ExpansionType } from "./use-expansions";
import type { FullDeckType } from "./deck-types";
import type { PipelineTrendRow } from "../types/pipeline-data";
import { parseScoreRef } from "./card-ref";

export interface ExpansionLiveCard extends CardType {
  cardNumber: string;
}

export interface ExpansionLiveDeck {
  deck: FullDeckType;
  displayName: string;
}

interface CardScore {
  name: string;
  score: number;
}

export const expansionPageData = (
  expansion: ExpansionType,
  cards: CardType[],
  scores: CardScore[],
  decks: FullDeckType[],
  displayName: (deck: FullDeckType) => string
) => {
  const expansionCards = new Map(
    cards
      .filter((card) => card.set === expansion.id)
      .map((card) => [card.id, { ...card, cardNumber: card.id.slice(card.id.lastIndexOf("-") + 1) }])
  );
  const liveDecks = decks
    .filter((deck) => deck.bestList.cards.some((card) => expansionCards.has(card.id)))
    .map((deck) => ({ deck, displayName: displayName(deck) }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  const used = new Set(
    liveDecks.flatMap(({ deck }) =>
      deck.bestList.cards
        .map((card) => card.id)
        .filter((id) => expansionCards.has(id))
    )
  );
  const scoreByCardId = new Map<string, number>();
  for (const score of scores) {
    const { id } = parseScoreRef(score.name);
    if (!scoreByCardId.has(id)) scoreByCardId.set(id, score.score);
  }
  return {
    cards: [...used]
      .map((id) => expansionCards.get(id))
      .filter((card): card is ExpansionLiveCard => card !== undefined)
      .sort((a, b) => {
        const scoreDifference = (scoreByCardId.get(b.id) ?? 0) - (scoreByCardId.get(a.id) ?? 0);
        return scoreDifference || a.cardNumber.localeCompare(b.cardNumber, undefined, { numeric: true });
      }),
    decks: liveDecks,
  };
};

export const postReleaseTrendRows = (
  rows: PipelineTrendRow[],
  releaseDate: string
): PipelineTrendRow[] =>
  rows
    .filter((row) => row.date >= releaseDate)
    .sort((a, b) => a.date.localeCompare(b.date));

export const trendMovement = (
  rows: PipelineTrendRow[],
  deckNames: string[]
): Record<string, { start: number; end: number }> => {
  if (rows.length < 2) return {};
  const first = rows[0];
  const last = rows.at(-1)!;
  return Object.fromEntries(
    deckNames.flatMap((name) => {
      const start = first[name];
      const end = last[name];
      return typeof start === "number" && typeof end === "number"
        ? [[name, { start, end }] as const]
        : [];
    })
  );
};
