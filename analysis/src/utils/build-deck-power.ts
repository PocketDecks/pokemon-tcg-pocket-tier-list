// Deck Power metrics, modelled on the Vicious Syndicate Data Reaper Report.
//
// Power Score answers "if you queued 100 games with this deck against the
// current field, how many would you win", rescaled so that an even win rate
// reads as exactly 50 and the best deck in the field reads as 100. Frequency
// Score is play rate against the most-played deck. Meta Score is the simple
// average of the two, as VS publishes it.
//
// Matchup win rates come from all games since the expansion release under a
// linear recency ramp; field share comes from the trailing 14 days. That
// asymmetry is deliberate and matches VS: a long window where you need
// sample, a short one where you need recency.
//
// Pure by design. No file reads, no dates, no globals, so every number here
// is reproducible from its inputs and the tests never depend on a scrape.
import { PipelineMatchupEntry } from "../../../src/types/pipeline-data";
import {
  MATCHUP_PRIOR_GAMES,
  MIN_FIELD_COVERAGE,
  MIN_MATCHUP_GAMES,
} from "../settings";

export interface DeckPowerInput {
  name: string;
  /** The deck's matchup-data.json rows, including the synthetic Total row. */
  matchups: PipelineMatchupEntry[];
  /** Qualified games in the trailing 14-day window. */
  games14: number;
}

export interface DeckPowerResult {
  name: string;
  /** 0..1 win rate against the field, always present. */
  expectedWinRate: number;
  /** 0..1 share of the field this deck has usable matchup data against. */
  fieldCoverage: number;
  /** 0..100, or null when fieldCoverage is below MIN_FIELD_COVERAGE. */
  powerScore: number | null;
  /** 0..100 against the most-played deck, always present. */
  freqScore: number;
  /** (powerScore + freqScore) / 2, or null when unranked. */
  metaScore: number | null;
}

/**
 * Rescales an expected win rate onto the VS Power Score.
 *
 * The best deck in the field is fixed at 100 and the zero point at
 * `1 - maxExpectedWinRate`, which places an even win rate on exactly 50.
 * Returns 50 when no deck is above even, since the span would be zero or
 * negative and the scale would invert.
 */
export const toPowerScale = (
  expectedWinRate: number,
  maxExpectedWinRate: number
): number => {
  const span = 2 * maxExpectedWinRate - 1;
  if (span <= 0) return 50;
  const zeroPoint = 1 - maxExpectedWinRate;
  const scaled = (100 * (expectedWinRate - zeroPoint)) / span;
  return Math.max(0, Math.min(100, scaled));
};

export const buildDeckPower = (inputs: DeckPowerInput[]): DeckPowerResult[] => {
  if (!inputs.length) return [];

  const totalGames14 = inputs.reduce((sum, d) => sum + d.games14, 0);
  const share14 = new Map(
    inputs.map((d) => [d.name, totalGames14 > 0 ? d.games14 / totalGames14 : 0])
  );
  const maxGames14 = Math.max(...inputs.map((d) => d.games14));

  const partial = inputs.map((deck) => {
    const rows = deck.matchups.filter(
      (row) =>
        row.name !== "Total" &&
        row.totalGames >= MIN_MATCHUP_GAMES &&
        share14.has(row.name)
    );

    const fieldCoverage = rows.reduce(
      (sum, row) => sum + (share14.get(row.name) ?? 0),
      0
    );

    // Each matchup is pulled toward 50% by its own sample, so a thin row
    // cannot swing the result. Weighted by how common that opponent is.
    const weighted = rows.reduce((sum, row) => {
      const wins = row.winRate * row.totalGames;
      const smoothed =
        (wins + MATCHUP_PRIOR_GAMES * 0.5) /
        (row.totalGames + MATCHUP_PRIOR_GAMES);
      return sum + (share14.get(row.name) ?? 0) * smoothed;
    }, 0);

    return {
      name: deck.name,
      expectedWinRate: fieldCoverage > 0 ? weighted / fieldCoverage : 0.5,
      fieldCoverage,
      freqScore: maxGames14 > 0 ? (100 * deck.games14) / maxGames14 : 0,
      ranked: fieldCoverage >= MIN_FIELD_COVERAGE,
    };
  });

  // The scale is set by the best RANKED deck, so a thin deck with a freak
  // win rate cannot stretch everyone else's Power Score toward zero.
  const ranked = partial.filter((d) => d.ranked);
  const maxExpectedWinRate = ranked.length
    ? Math.max(...ranked.map((d) => d.expectedWinRate))
    : 0;

  return partial.map(({ ranked: isRanked, ...deck }) => {
    const powerScore = isRanked
      ? toPowerScale(deck.expectedWinRate, maxExpectedWinRate)
      : null;
    return {
      ...deck,
      powerScore,
      metaScore: powerScore === null ? null : (powerScore + deck.freqScore) / 2,
    };
  });
};
