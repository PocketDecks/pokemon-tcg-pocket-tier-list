import expansions from "pokemon-tcg-pocket-cards/data/v5/expansions.json";

// export const DEBUG: boolean = false;

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

// Exclude ex-only decks from analysis.
export const NOEX: boolean = false;
// Number of cards in a legal deck.
export const CARDS_IN_DECK: number = 20;
export const NOEX_PERCENT_CUTOFF: number = 0.2;
// Deck is filtered out above this share of trainer-less games.
export const NO_TRAINER_PERCENT_CUTOFF: number = 0.1;
// Tournaments with fewer players than this are ignored.
export const MIN_GAMES_IN_TOURNAMENT: number = 50;
// Hard cap on decks analysed per run.
export const MAX_DECKS_TO_ANALYZE: number = 400_000;
// Per-(player, tournament) win-rate gate: a deck only scores if that player won at least this share of games (0.6 ≈ 5-3 in 8 rounds, 4-2 in 6).
export const MIN_WINRATE_THRESHOLD: number = 0.6;
// Minimum qualified games an archetype needs before it ranks, to drop 1-2-deck flukes while keeping fresh archetypes visible.
export const MIN_ARCHETYPE_QUALIFIED_GAMES: number = 25;

const SECONDS_IN_WEEK = 7 * 24 * 60 * 60 * 1000;

export const scoringWeights = (now: Date) => {
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

const CURRENT_SCORING_WEIGHTS = scoringWeights(new Date());
// Weight given to win-rate in the composite deck score; rises with weeks since release.
export const WINRATE_IMPORTANCE = CURRENT_SCORING_WEIGHTS.winrateImportance;
// Residual weight given to popularity; the complement of WINRATE_IMPORTANCE.
export const POPULARITY_IMPORTANCE = CURRENT_SCORING_WEIGHTS.popularityImportance;

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
