import expansions from "pokemon-tcg-pocket-cards/data/v5/expansions.json";

// export const DEBUG: boolean = false;

const EXCLUDED_SET_IDS = new Set(["a4b"]);

const FALLBACK_RELEASE_DATE = new Date("2026-08-27");

const latestReleaseDate = (): Date => {
  const list = expansions as { id: string; release_date: string | null }[];
  for (let i = list.length - 1; i >= 0; i--) {
    const entry = list[i];
    if (!entry || EXCLUDED_SET_IDS.has(entry.id)) continue;
    if (!entry.release_date) continue;
    const parsed = new Date(entry.release_date);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return FALLBACK_RELEASE_DATE;
};

// Release date of the newest expansion; the win-rate ramp and new-set multiplier are timed from it.
export const EXPANSION_RELEASE_DATE: Date = latestReleaseDate();

// Exclude ex-only decks from analysis.
export const NOEX: boolean = false;
// Multiplier applied to pre-expansion decks.
export const OLD_MULTIPLIER: number = 1;
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

const NOW = new Date();
const SECONDS_IN_WEEK = 7 * 24 * 60 * 60 * 1000;
const TIME_PASSED = NOW.getTime() - EXPANSION_RELEASE_DATE.getTime();
const WEEKS_LIVE = TIME_PASSED / SECONDS_IN_WEEK;
console.log("WEEKS_LIVE:", WEEKS_LIVE);

const _WINRATE_IMPORTANCE = 0.2 + WEEKS_LIVE * 0.15;
// Weight given to win-rate in the composite deck score; rises with weeks since release.
export const WINRATE_IMPORTANCE = Math.min(_WINRATE_IMPORTANCE, 0.75);
// Residual weight given to popularity; the complement of WINRATE_IMPORTANCE.
export const POPULARITY_IMPORTANCE: number = 1 - WINRATE_IMPORTANCE;
console.log("WINRATE_IMPORTANCE:", WINRATE_IMPORTANCE);

// Multiplier applied to decks from the newest expansion; grows with weeks since release.
export const NEW_MULTIPLIER: number = 1 + WEEKS_LIVE / 1.5;
console.log("NEW_MULTIPLIER:", NEW_MULTIPLIER);
