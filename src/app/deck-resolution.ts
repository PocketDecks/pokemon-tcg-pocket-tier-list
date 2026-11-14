import {
  ATTACKS_BY_DECK_BUILDER_NR,
  CARDS_BY_ID,
  type CardType,
} from "./cards-api";
import {
  cardToCount,
  cardToId,
  deckNameToIconIds,
  findUnresolvedCardIds,
  isAffordable,
} from "./deck-filters";
import { inferEnergyIds } from "./deck-energy";
import { createDeckCode } from "./deck-code";
import { deckSlug } from "./deck-slug";
import type {
  PipelineDeckList,
  PipelinePartialDeck,
} from "../types/pipeline-data";

export interface FullList {
  cards: CardType[];
  score: number;
  strength: number;
  energyIds: number[];
  deckCode: string | null;
}

/// Everything a deck page renders once its deck is known. `FullDeckType`
/// extends it with the tier-list-only fields.
export interface ResolvedDeck {
  id: string;
  name: string;
  lists: FullList[];
  bestList: FullList;
  score: number;
  strength: number;
  expectedWinRate: number;
  fieldCoverage: number;
  powerScore: number | null;
  freqScore: number;
  metaScore: number | null;
  iconPrimary: CardType;
  iconSecondary: CardType | null;
}

/// Expands "count:id" string refs into the card objects one list renders.
/// Shared by the tier-list build and the detail resolver so energy/deck-code
/// inference has exactly one implementation. Callers drop lists with
/// unresolved ids first.
export const buildFullLists = (lists: PipelineDeckList[]): FullList[] =>
  lists.map((oldList) => {
    const newCards: CardType[] = [];
    for (const oldCard of oldList.cards) {
      const amount = cardToCount(oldCard);
      const card = CARDS_BY_ID.get(cardToId(oldCard)) as CardType;
      for (let i = 0; i < amount; i++) newCards.push(card);
    }
    return {
      score: oldList.score,
      strength: oldList.strength,
      cards: newCards,
      energyIds: [],
      deckCode: null,
    };
  });

/// Augments the highest-scoring list with energy ids and a shareable deck code.
/// Cards without a deckBuilderNr carry neither.
export const pickBestList = (lists: FullList[]): FullList => {
  const best = [...lists].sort((a, b) => b.score - a.score)[0];
  const deckBuilderNrs = best.cards.map((card) => card.deckBuilderNr);
  if (deckBuilderNrs.some((nr) => nr == null)) {
    return { ...best, energyIds: [], deckCode: null };
  }
  const energyIds = inferEnergyIds(
    best.cards.map((card) => ({
      supertype: card.supertype,
      deckBuilderNr: card.deckBuilderNr as number,
      attacks: ATTACKS_BY_DECK_BUILDER_NR.get(card.deckBuilderNr as number),
    }))
  );
  return { ...best, energyIds, deckCode: createDeckCode(deckBuilderNrs as number[], energyIds) };
};

/// The id a pipeline deck gets once resolved, for matching raw decks to a slug.
export const rawDeckId = (raw: { name: string }): string => deckSlug(raw.name);

/// Builds the view model for one pipeline deck from the lists that survived
/// filtering. Used by the tier-list build and the detail resolver.
export const resolveDeck = (
  raw: PipelinePartialDeck,
  lists: PipelineDeckList[]
): ResolvedDeck => {
  const fullLists = buildFullLists(lists);
  const cardIds = deckNameToIconIds(raw.name);
  return {
    id: rawDeckId(raw),
    name: raw.name,
    lists: fullLists,
    bestList: pickBestList(fullLists),
    score: Math.max(...fullLists.map((l) => l.score)),
    strength: Math.max(...fullLists.map((l) => l.strength)),
    expectedWinRate: raw.expectedWinRate,
    fieldCoverage: raw.fieldCoverage,
    powerScore: raw.powerScore,
    freqScore: raw.freqScore,
    metaScore: raw.metaScore,
    iconPrimary: CARDS_BY_ID.get(cardIds[0]) as CardType,
    iconSecondary: cardIds[1] ? CARDS_BY_ID.get(cardIds[1]) ?? null : null,
  };
};

/// Resolves one deck by id straight from the raw pipeline data, filtered by the
/// missing-card rule alone. Tier-list-wide concerns (energy, EX, expansion,
/// deck count, paired trim, rank) never gate a page the user has already
/// navigated to, and any of them dropping the deck from `decks` must not reroute
/// it to a stale second build. When every list is unaffordable the unfiltered
/// lists render an empty grid (extinct) so Undo stays available.
export const resolveDeckDetail = (
  decksRaw: PipelinePartialDeck[],
  deckId: string,
  missingCounts: Record<string, number>
): { deck: ResolvedDeck; extinct: boolean } | null => {
  const oldDeck = decksRaw.find((d) => rawDeckId(d) === deckId);
  if (!oldDeck) return null;

  // Unresolvable card ids fail the same way as in buildDecks: the list cannot
  // render, so it is dropped before the affordability check.
  const resolvedLists = oldDeck.lists.filter(
    (list) => findUnresolvedCardIds(list.cards).length === 0
  );
  if (resolvedLists.length === 0) return null;

  const affordableLists = resolvedLists.filter((list) =>
    isAffordable(list.cards, missingCounts)
  );
  const extinct = affordableLists.length === 0;
  const listsToUse = extinct ? resolvedLists : affordableLists;

  return { extinct, deck: resolveDeck(oldDeck, listsToUse) };
};
