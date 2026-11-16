import type {
  MetaShareEntry,
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

const isOptional = (value: unknown, check: (value: unknown) => boolean): boolean =>
  value === undefined || check(value);

const isString = (value: unknown): value is string => typeof value === "string";

const isMetaShareEntry = (entry: unknown): entry is MetaShareEntry =>
  isRecord(entry) &&
  isString(entry.name) &&
  isFiniteNumber(entry.share) &&
  isFiniteNumber(entry.windowGames) &&
  isOptional(entry.sharePrev, isFiniteNumber) &&
  isOptional(entry.delta, isFiniteNumber) &&
  isOptional(entry.firstSeen, isString) &&
  isOptional(entry.isNew, (value) => typeof value === "boolean");

const parseMetaShare = (data: unknown, file: string): PipelineMetaShare => {
  if (
    !isRecord(data) ||
    !isString(data.generatedAt) ||
    !(data.windowDays === null || isFiniteNumber(data.windowDays)) ||
    !Array.isArray(data.decks) ||
    !data.decks.every(isMetaShareEntry)
  ) {
    throw new Error(`${file} has an unexpected shape`);
  }
  return {
    generatedAt: data.generatedAt,
    windowDays: data.windowDays,
    decks: data.decks,
  };
};

// A failed load throws. React Query retries it and then reports an error,
// so a bad response is never cached as "no share data".
export const loadMetaShare = async (
  window: MetaWindow,
  tier: ArtefactTier
): Promise<PipelineMetaShare> =>
  parseMetaShare(
    await loadTieredArtefact("meta-share", window, tier),
    metaWindowDataFile("meta-share", window)
  );

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
