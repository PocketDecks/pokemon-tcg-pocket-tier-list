import { Deck } from "./types";
import {
  MetaShareEntry,
  PipelineMetaShare,
  PipelinePartialDeck,
} from "../../../src/types/pipeline-data";

const DAY_MS = 24 * 60 * 60 * 1000;
export const WINDOW_DAYS = 7;
export const GAMES_WINDOW_DAYS = 14;

const dayKey = (iso: string) => iso.split("T")[0];

// Snapshots each tracked archetype's share of qualified games over the trailing
// 7 days, the prior week's share, the delta, and first-seen date. Windows are
// inclusive calendar-day ranges; bestDecks must arrive pre-sorted by score.
export const buildMetaShare = (
  qualifiedDecks: Deck[],
  bestDecks: PipelinePartialDeck[],
  today: Date
): PipelineMetaShare => {
  const tracked = new Set(bestDecks.map((d) => d.name));
  const todayMs = today.getTime();

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

  // Calendar days come from `today`, not observed data, so empty days contribute zero instead of shifting the window.
  const windowDays: string[] = [];
  const prevDays: string[] = [];
  for (let offset = 0; offset < WINDOW_DAYS; offset++) {
    windowDays.push(dayKey(new Date(todayMs - offset * DAY_MS).toISOString()));
    prevDays.push(
      dayKey(new Date(todayMs - (WINDOW_DAYS + offset) * DAY_MS).toISOString())
    );
  }

  // Longer window for raw games played. The dataset is already filtered to decks dated on/after release, so a fresh expansion caps this window naturally.
  const gamesDays: string[] = [];
  for (let offset = 0; offset < GAMES_WINDOW_DAYS; offset++) {
    gamesDays.push(dayKey(new Date(todayMs - offset * DAY_MS).toISOString()));
  }

  const sumWindow = (days: string[], name: string): number =>
    days.reduce((sum, day) => sum + (games[day]?.[name] ?? 0), 0);

  const entries: MetaShareEntry[] = [];
  let curTotal = 0;
  let prevTotal = 0;

  for (const name of tracked) {
    curTotal += sumWindow(windowDays, name);
    prevTotal += sumWindow(prevDays, name);
  }

  for (const name of tracked) {
    const curGames = sumWindow(windowDays, name);
    const prevGames = sumWindow(prevDays, name);
    const share = curTotal > 0 ? curGames / curTotal : 0;
    const sharePrev = prevTotal > 0 ? prevGames / prevTotal : 0;
    const games14 = sumWindow(gamesDays, name);
    const seen = firstSeen.get(name) ?? dayKey(today.toISOString());

    entries.push({
      name,
      share,
      sharePrev,
      delta: share - sharePrev,
      games14,
      firstSeen: seen,
      isNew:
        new Date(`${seen}T00:00:00Z`).getTime() >=
        new Date(`${windowDays[windowDays.length - 1]}T00:00:00Z`).getTime(),
    });
  }

  return {
    generatedAt: today.toISOString(),
    windowDays: WINDOW_DAYS,
    decks: entries.sort((a, b) => b.share - a.share),
  };
};
