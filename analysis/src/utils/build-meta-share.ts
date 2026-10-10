import { Deck } from "./types";
import {
  MetaShareEntry,
  PipelineMetaShare,
  PipelinePartialDeck,
} from "../../../src/types/pipeline-data";

const DAY_MS = 24 * 60 * 60 * 1000;
export const WINDOW_DAYS = 7;
export const GAMES_WINDOW_DAYS = 14;

// meta-share.json's shape with a window length that can be absent. The all-time
// artefact has no trailing window to name, so it writes null.
export interface WindowMetaShare extends Omit<PipelineMetaShare, "windowDays"> {
  windowDays: number | null;
}

// One artefact's windows. shareDays and gamesDays are trailing calendar-day
// counts, null meaning the whole store; anchor is the last calendar day a
// window may include. The windowed pipeline passes the newest data date, so a
// dataset that stops short of the run date still fills its windows.
export interface MetaShareWindow {
  shareDays: number | null;
  gamesDays: number | null;
  anchor?: Date;
}

const DEFAULT_WINDOW: MetaShareWindow = {
  shareDays: WINDOW_DAYS,
  gamesDays: GAMES_WINDOW_DAYS,
};

const dayKey = (iso: string) => iso.split("T")[0];

// Calendar days come from the anchor, not observed data, so empty days contribute zero instead of shifting the window.
const windowDayKeys = (
  anchorMs: number,
  startOffset: number,
  days: number | null
): string[] | null => {
  if (days === null) return null;
  const keys: string[] = [];
  for (let offset = startOffset; offset < startOffset + days; offset++) {
    keys.push(dayKey(new Date(anchorMs - offset * DAY_MS).toISOString()));
  }
  return keys;
};

// Snapshots each tracked archetype's share of qualified games over the trailing
// window, the previous window's share, the delta, and first-seen date. Windows
// are inclusive calendar-day ranges; bestDecks must arrive pre-sorted by score.
export const buildMetaShare = (
  qualifiedDecks: Deck[],
  bestDecks: PipelinePartialDeck[],
  today: Date,
  window: MetaShareWindow = DEFAULT_WINDOW
): WindowMetaShare => {
  const tracked = new Set(bestDecks.map((d) => d.name));
  const anchorMs = (window.anchor ?? today).getTime();

  // [gamesByDayByDeck][day][deckName] = summed totalGames
  const games: Record<string, Record<string, number>> = {};
  const firstSeen = new Map<string, string>();

  for (const deck of qualifiedDecks) {
    const day = dayKey(deck.date);
    if (!games[day]) games[day] = {};

    games[day][deck.name] = (games[day][deck.name] ?? 0) + deck.totalGames;

    const known = firstSeen.get(deck.name);
    if (!known || day < known) firstSeen.set(deck.name, day);
  }

  const currentDays = windowDayKeys(anchorMs, 0, window.shareDays);
  // An all-time artefact has no prior window, so it compares against itself and reports no movement.
  const previousDays =
    window.shareDays === null
      ? null
      : windowDayKeys(anchorMs, window.shareDays, window.shareDays);
  const gamesDays = windowDayKeys(anchorMs, 0, window.gamesDays);

  const sumWindow = (days: string[] | null, name: string): number =>
    days === null
      ? Object.keys(games).reduce((sum, day) => sum + (games[day][name] ?? 0), 0)
      : days.reduce((sum, day) => sum + (games[day]?.[name] ?? 0), 0);

  const entries: MetaShareEntry[] = [];
  let curTotal = 0;
  let prevTotal = 0;

  for (const name of tracked) {
    curTotal += sumWindow(currentDays, name);
    prevTotal += sumWindow(previousDays, name);
  }

  for (const name of tracked) {
    const curGames = sumWindow(currentDays, name);
    const prevGames = sumWindow(previousDays, name);
    const share = curTotal > 0 ? curGames / curTotal : 0;
    const sharePrev = prevTotal > 0 ? prevGames / prevTotal : 0;
    // Qualified games in this artefact's window; the field keeps its name so the
    // file shape stays the one the frontend already parses.
    const gamesPlayed = sumWindow(gamesDays, name);
    const seen = firstSeen.get(name) ?? dayKey(today.toISOString());
    const windowStart = currentDays?.[currentDays.length - 1];

    entries.push({
      name,
      share,
      sharePrev,
      delta: share - sharePrev,
      games14: gamesPlayed,
      firstSeen: seen,
      isNew:
        windowStart !== undefined &&
        new Date(`${seen}T00:00:00Z`).getTime() >=
          new Date(`${windowStart}T00:00:00Z`).getTime(),
    });
  }

  return {
    generatedAt: today.toISOString(),
    windowDays: window.shareDays,
    decks: entries.sort((a, b) => b.share - a.share),
  };
};
