import { CardType, CardsPayload } from "./cards-api";
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
  PipelineMatchupEntry,
  PipelinePartialDeck,
} from "../types/pipeline-data";

export interface FullList {
  cards: CardType[];
  score: number;
  strength: number;
  energyIds: number[];
  deckCode: string | null;
}

/// Shared shape between the tier-list build (FullDeckType) and the single-deck
/// detail resolver: everything a deck page renders once its deck is known.
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
  matchups: PipelineMatchupEntry[] | undefined;
  iconPrimary: CardType;
  iconSecondary: CardType | null;
}

/// Expands "count:id" string refs into the card objects one list renders.
/// Shared by the tier-list build and the detail resolver so energy/deck-code
/// inference has exactly one implementation.
export const buildFullLists = (
  lists: PipelineDeckList[],
  cardsMapping: Record<string, CardType>,
  cardsPayload: CardsPayload
): FullList[] =>
  lists.map((oldList) => {
    const newCards: CardType[] = [];
    for (const oldCard of oldList.cards) {
      const amount = cardToCount(oldCard);
      const id = cardToId(oldCard);
      const card = cardsMapping[id];
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
export const pickBestList = (lists: FullList[], cardsPayload: CardsPayload): FullList => {
  const best = [...lists].sort((a, b) => b.score - a.score)[0];
  const deckBuilderNrs = best.cards.map((card) => card.deckBuilderNr);
  if (deckBuilderNrs.some((nr) => nr == null)) {
    return { ...best, energyIds: [], deckCode: null };
  }
  const energyIds = inferEnergyIds(
    best.cards.map((card) => ({
      supertype: card.supertype,
      deckBuilderNr: card.deckBuilderNr as number,
      attacks: cardsPayload.attacksByDeckBuilderNr.get(card.deckBuilderNr as number),
    }))
  );
  return { ...best, energyIds, deckCode: createDeckCode(deckBuilderNrs as number[], energyIds) };
};

/// Resolves one deck by id straight from the raw pipeline data, filtered by the
/// missing-card rule alone. Tier-list-wide concerns (energy, EX, expansion,
/// deck count, paired trim, rank) never gate a page the user has already
/// navigated to, and any of them dropping the deck from `decks` must not reroute
/// it to a stale second build. When every list is unaffordable the unfiltered
/// lists render an empty grid (extinct) so Undo stays available.
export const resolveDeckDetail = (
  decksRaw: PipelinePartialDeck[],
  matchupData: Record<string, PipelineMatchupEntry[]>,
  cardsPayload: CardsPayload,
  cardsMapping: Record<string, CardType>,
  deckId: string,
  missingCounts: Record<string, number>
): { deck: ResolvedDeck; extinct: boolean } | null => {
  const oldDeck = decksRaw.find((d) => deckSlug(d.name) === deckId);
  if (!oldDeck) return null;

  // Unresolvable card ids fail the same way as in buildDecks: the list cannot
  // render, so it is dropped before the affordability check.
  const resolvedLists = oldDeck.lists.filter(
    (list) => findUnresolvedCardIds(list.cards, cardsMapping).length === 0
  );
  if (resolvedLists.length === 0) return null;

  const affordableLists = resolvedLists.filter((list) =>
    isAffordable(list.cards, missingCounts)
  );
  const extinct = affordableLists.length === 0;
  const listsToUse = extinct ? resolvedLists : affordableLists;

  const fullLists = buildFullLists(listsToUse, cardsMapping, cardsPayload);
  const bestList = pickBestList(fullLists, cardsPayload);

  const cardIds = deckNameToIconIds(oldDeck.name);
  const iconSecondary = cardIds[1] ? cardsMapping[cardIds[1]] ?? null : null;

  return {
    extinct,
    deck: {
      id: deckSlug(oldDeck.name),
      name: oldDeck.name,
      lists: fullLists,
      bestList,
      score: Math.max(...fullLists.map((l) => l.score)),
      strength: Math.max(...fullLists.map((l) => l.strength)),
      expectedWinRate: oldDeck.expectedWinRate,
      fieldCoverage: oldDeck.fieldCoverage,
      powerScore: oldDeck.powerScore,
      freqScore: oldDeck.freqScore,
      metaScore: oldDeck.metaScore,
      matchups: matchupData[oldDeck.name],
      iconPrimary: cardsMapping[cardIds[0]],
      iconSecondary,
    },
  };
};

