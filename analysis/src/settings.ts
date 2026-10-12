import expansions from "pokemon-tcg-pocket-cards/data/v5/expansions.json";
import type { WindowId } from "./utils/build-window-artefacts";

export const DELUXE_SET_IDS = new Set(["a4b", "b4b"]);

const FALLBACK_RELEASE_DATE = new Date("2026-08-27");

export const latestReleaseDate = (
  list: readonly { id: string; release_date: string | null }[]
): Date => {
  let newest: Date | null = null;
  for (const entry of list) {
    if (DELUXE_SET_IDS.has(entry.id)) continue;
    if (!entry.release_date) continue;
    const parsed = new Date(entry.release_date);
    if (Number.isNaN(parsed.getTime())) continue;
    if (!newest || parsed.getTime() > newest.getTime()) {
      newest = parsed;
    }
  }
  return newest ?? FALLBACK_RELEASE_DATE;
};

// Release date of the newest expansion; the win-rate weight ramps from it.
export const EXPANSION_RELEASE_DATE: Date = latestReleaseDate(
  expansions as { id: string; release_date: string | null }[]
);

// Number of cards in a legal deck.
export const CARDS_IN_DECK: number = 20;
export const NOEX_PERCENT_CUTOFF: number = 0.2;
// Tournaments where this share of decks or more run no trainers are filtered out.
export const NO_TRAINER_PERCENT_CUTOFF: number = 0.1;
// Tournaments with fewer players than this are ignored.
export const MIN_PLAYERS_IN_TOURNAMENT: number = 50;
// Per-(player, tournament) win-rate gate: a deck only scores if that player won at least this share of games (0.6 ≈ 5-3 in 8 rounds, 4-2 in 6).
export const MIN_WINRATE_THRESHOLD: number = 0.6;
// Minimum qualified games an archetype needs before it ranks, to drop 1-2-deck flukes while keeping fresh archetypes visible.
export const MIN_ARCHETYPE_QUALIFIED_GAMES: number = 25;

const SECONDS_IN_WEEK = 7 * 24 * 60 * 60 * 1000;

export interface ScoringWeights {
  winrateImportance: number;
  popularityImportance: number;
}

export const scoringWeights = (now: Date): ScoringWeights => {
  const weeksLive = Math.max(
    0,
    (now.getTime() - EXPANSION_RELEASE_DATE.getTime()) / SECONDS_IN_WEEK
  );
  const winrateImportance = Math.min(0.2 + weeksLive * 0.15, 0.75);

  return {
    winrateImportance,
    popularityImportance: 1 - winrateImportance,
  };
};

// Pseudo-games pulling each matchup win rate toward 50%, so a 4-game matchup
// barely moves a deck's expected win rate and a 500-game one counts almost
// fully. This replaces a hard opponent-games floor, which discarded 41 of 62
// decks entirely and left the ranking 99% correlated with play rate.
export const MATCHUP_PRIOR_GAMES: number = 30;

// Matchup rows below this are dropped as noise before smoothing. Sized on the
// qualified population Power Score reads: a qualified row holds a median 0.57
// of the games its all-player counterpart carries, so the floor the all-player
// tally was cut for keeps only about half the rows that used to clear it.
export const MIN_MATCHUP_GAMES: number = 2;

// Share of the field a deck's matchup data must cover before it gets a Power
// Score. Below this the deck is unranked rather than given an invented score.
// The share denominator is the qualified 14-day field, so the coverage it
// guards is the share of that field the deck has usable qualified matchup rows
// against.
//
// 0.5 was carried over from the all-player tally, where it ranked 40 to 50
// percent of archetypes; on qualified rows it holds under 30 percent, so the
// bar follows the coverage distribution down instead of discarding most of the
// field. The committed pair ranks roughly half to two thirds of archetypes, at
// or above the published ranking's breadth, with every ranked deck clearing the
// bar itself.
export const MIN_FIELD_COVERAGE: number = 0.25;

// Per-window floors on published archetypes. The 2026-09-24 data publishes
// 24, 48, 64 and 64; each floor is about half of those.
export const MIN_PUBLISHED_ARCHETYPES: Record<WindowId, number> = {
  "10d": 12,
  "20d": 25,
  "30d": 32,
  all: 32,
};

// A window may shrink by half against the previous publish, no further.
export const MIN_PREVIOUS_ARCHETYPE_RATIO: number = 0.5;

// Archetypes in the default window that must carry a Power Score. The same
// data had 42 of 48.
export const MIN_RANKED_ARCHETYPES: number = 20;

// Days of data over which each window's floors ramp up after a release, so a
// new expansion publishes while its field fills. A replay of 19 expansions
// refused 28 of 645 days with the ramp, against 222 without it.
export const FLOOR_RAMP_DAYS: Record<WindowId, number> = {
  "10d": 10,
  "20d": 20,
  "30d": 30,
  all: 30,
};

// The newest qualified deck may be at most this many days older than the run.
// The longest gap between tournament days since April was 5.
export const MAX_DATA_AGE_DAYS: number = 7;
