import { CARDS_BY_ID } from "../../app/cards-api";
import { deckNameToIconIds } from "../../app/deck-filters";
import { deckDisplayName, formatArchetypeId } from "../../app/deck-display";
import type { FullDeckType } from "../../app/deck-types";
import { hasMovement } from "../../app/meta-share-window";
import type { MovingMetaShareEntry, PipelineMetaShare } from "../../types/pipeline-data";

export type MovementView = "rising" | "falling" | "new";

export const MOVEMENT_VIEWS: readonly MovementView[] = ["rising", "falling", "new"];

const MOVEMENT_THRESHOLD = 0.001;
const MOVEMENT_ROW_LIMIT = 15;

export const selectMovementEntries = (
  metaShare: PipelineMetaShare | null,
  view: MovementView
): MovingMetaShareEntry[] => {
  if (!metaShare) return [];
  const entries = metaShare.decks.filter(hasMovement);
  if (view === "new") {
    return entries.filter((entry) => entry.isNew).sort((a, b) => b.share - a.share);
  }
  if (view === "rising") {
    return entries
      .filter((entry) => entry.delta > MOVEMENT_THRESHOLD)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, MOVEMENT_ROW_LIMIT);
  }
  return entries
    .filter((entry) => entry.delta < -MOVEMENT_THRESHOLD)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, MOVEMENT_ROW_LIMIT);
};

export interface MovementRow {
  name: string;
  rank: number;
  displayName: string;
  iconSrc: string | undefined;
  href: string;
  /// True for a deck missing from the viewer's deck list, which is shown with a premium crown.
  premium: boolean;
  shareLabel: string;
  shareWidth: number;
  rising: boolean;
  deltaLabel: string;
}

const cardImage = (id: string | undefined) => (id ? CARDS_BY_ID.get(id)?.image : undefined);

const archetypeName = (name: string): string =>
  deckNameToIconIds(name)
    .map((id) => CARDS_BY_ID.get(id)?.name)
    .filter(Boolean)
    .join(" / ") || formatArchetypeId(name);

export const buildMovementRows = (
  entries: MovingMetaShareEntry[],
  decksById: ReadonlyMap<string, FullDeckType>,
  hrefFor: (slug: string) => string
): MovementRow[] => {
  const maxShare = Math.max(0.0001, ...entries.map((entry) => entry.share));
  return entries.map((entry, index) => {
    const deck = decksById.get(entry.name);
    const rising = entry.delta > 0;
    const points = `${(entry.delta * 100).toFixed(1)} pp`;
    return {
      name: entry.name,
      rank: index + 1,
      displayName: deck ? deckDisplayName(deck) : archetypeName(entry.name),
      iconSrc: deck?.iconPrimary?.image ?? cardImage(deckNameToIconIds(entry.name)[0]),
      href: hrefFor(entry.name),
      premium: !deck,
      shareLabel: `${(entry.share * 100).toFixed(1)}%`,
      shareWidth: (entry.share / maxShare) * 100,
      rising,
      deltaLabel: rising ? `+${points}` : points,
    };
  });
};
