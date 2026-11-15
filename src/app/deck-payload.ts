import type {
  PipelineMatchupData,
  PipelineMetaShare,
  PipelinePartialDeck,
} from "../types/pipeline-data";
import type { MatchupType } from "./deck-types";
import {
  loadTieredArtefact,
  loadWindowArtefact,
  metaWindowDataFile,
  type ArtefactTier,
  type MetaWindow,
} from "./meta-window";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isDeckList = (list: unknown): boolean =>
  isRecord(list) &&
  Array.isArray(list.cards) &&
  list.cards.every((card) => typeof card === "string") &&
  isFiniteNumber(list.score) &&
  isFiniteNumber(list.strength);

const isPartialDeck = (deck: unknown): deck is PipelinePartialDeck =>
  isRecord(deck) &&
  typeof deck.name === "string" &&
  Array.isArray(deck.lists) &&
  deck.lists.every(isDeckList) &&
  isFiniteNumber(deck.popularity) &&
  isFiniteNumber(deck.percentOfGames);

export const parseBestDecks = (
  data: unknown,
  file: string
): PipelinePartialDeck[] => {
  if (!Array.isArray(data) || !data.every(isPartialDeck)) {
    throw new Error(`${file} has an unexpected shape`);
  }
  return data;
};

export const fetchBestDecks = async (
  window: MetaWindow
): Promise<PipelinePartialDeck[]> =>
  parseBestDecks(
    await loadWindowArtefact("best-decks", window),
    metaWindowDataFile("best-decks", window)
  );

// Share data is optional: any failure (network, 404, malformed JSON, wrong
// shape) degrades to null so deck pages and statistics keep loading.
export const loadMetaShare = async (
  window: MetaWindow,
  tier: ArtefactTier
): Promise<PipelineMetaShare | null> => {
  try {
    const data = await loadTieredArtefact("meta-share", window, tier);
    if (isRecord(data) && Array.isArray(data.decks)) {
      return data as unknown as PipelineMetaShare;
    }
    return null;
  } catch {
    return null;
  }
};

export interface SanitisedMatchupData {
  matchups: PipelineMatchupData;
  dropped: number;
}

export const sanitiseMatchupData = (
  data: Record<string, unknown>
): SanitisedMatchupData => {
  let dropped = 0;
  const matchups: PipelineMatchupData = {};
  for (const [deckName, rows] of Object.entries(data)) {
    if (!Array.isArray(rows)) {
      dropped += 1;
      continue;
    }
    const validRows: MatchupType[] = [];
    for (const row of rows) {
      const valid =
        row !== null &&
        typeof row === "object" &&
        !Array.isArray(row) &&
        typeof row.name === "string" &&
        typeof row.winRate === "number" &&
        Number.isFinite(row.winRate) &&
        row.winRate >= 0 &&
        row.winRate <= 1 &&
        typeof row.totalGames === "number" &&
        Number.isFinite(row.totalGames) &&
        row.totalGames >= 0;
      if (valid) validRows.push(row as MatchupType);
      else dropped += 1;
    }
    if (validRows.length === 0 && rows.length > 0) {
      dropped += 1;
      continue;
    }
    matchups[deckName] = validRows;
  }
  return { matchups, dropped };
};

export const fetchMatchupData = async (window: MetaWindow): Promise<PipelineMatchupData> => {
  const file = metaWindowDataFile("matchup-data", window);
  const data = await loadWindowArtefact("matchup-data", window);
  if (!isRecord(data)) {
    throw new Error(`${file} has an unexpected shape`);
  }

  const { matchups, dropped } = sanitiseMatchupData(data);

  if (dropped > 0) {
    console.warn(`Dropped ${dropped} invalid matchup entries from ${file}`);
  }
  if (Object.keys(matchups).length === 0) {
    throw new Error(`${file} has no valid matchup entries`);
  }
  return matchups;
};
