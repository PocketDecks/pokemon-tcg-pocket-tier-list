import { deckArchetypeSlug } from "../../app/deck-archetype";
import type { FullDeckType, MatchupType } from "../../app/deck-types";
import type { HubVariantRecord } from "../../app/use-hub-file";

export interface CoreCard {
  count: number;
  id: string;
}

export interface SimilarDeck {
  deck: FullDeckType;
  shared: number;
}

const CARD_ENTRY = /^(\d+):([a-z0-9-]+)$/;

const byText = (a: string, b: string) => a.localeCompare(b);

export const parseCardEntry = (entry: string): CoreCard | null => {
  const match = CARD_ENTRY.exec(entry);
  return match ? { count: Number(match[1]), id: match[2] } : null;
};

export const coreCardsOf = (entries: string[]): CoreCard[] =>
  entries.flatMap((entry) => {
    const card = parseCardEntry(entry);
    return card ? [card] : [];
  });

export const mostIncluded = <T extends { count: number }>(cards: T[], limit: number): T[] =>
  [...cards].sort((a, b) => b.count - a.count).slice(0, limit);

export const pickMatchups = (
  matchups: MatchupType[] | undefined,
  self: string,
  opponents: Set<string>,
  minGames: number,
  limit: number
): { best: MatchupType[]; worst: MatchupType[] } => {
  const eligible = (matchups ?? []).filter(
    (matchup) => matchup.name !== self && opponents.has(matchup.name) && matchup.totalGames > minGames
  );
  const best = [...eligible]
    .sort((a, b) => b.winRate - a.winRate || byText(a.name, b.name))
    .slice(0, limit);
  const bestNames = new Set(best.map((matchup) => matchup.name));
  const worst = eligible
    .filter((matchup) => !bestNames.has(matchup.name))
    .sort((a, b) => a.winRate - b.winRate || byText(a.name, b.name))
    .slice(0, limit);
  return { best, worst };
};

export const similarDecks = (
  decks: FullDeckType[],
  core: Set<string>,
  hub: string,
  limit: number
): SimilarDeck[] =>
  decks
    .filter((deck) => deckArchetypeSlug(deck.name) !== hub)
    .map((deck) => ({
      deck,
      shared: new Set(deck.bestList.cards.map((card) => card.id).filter((id) => core.has(id))).size,
    }))
    .filter((entry) => entry.shared > 0)
    .sort((a, b) => b.shared - a.shared || byText(a.deck.name, b.deck.name))
    .slice(0, limit);

export const newestFirst = <T extends HubVariantRecord>(variants: T[]): T[] =>
  [...variants].sort((a, b) => b.lastSeen.localeCompare(a.lastSeen) || byText(a.variant, b.variant));

export const hubPeak = (variants: HubVariantRecord[]): { share: number; date: string } | null =>
  variants.reduce<{ share: number; date: string } | null>((peak, variant) => {
    if (variant.peakShare === null || variant.peakDate === null) return peak;
    return peak === null || variant.peakShare > peak.share
      ? { share: variant.peakShare, date: variant.peakDate }
      : peak;
  }, null);
