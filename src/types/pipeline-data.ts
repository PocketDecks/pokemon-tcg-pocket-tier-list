// src/types/pipeline-data.ts
//
// Canonical shapes for the four JSON files analysis/src/get-best-decks.ts
// writes to public/data/*.json. This is the single source of truth that both
// analysis/ and src/ compile against. See private/NEXT_PRs_TO_DO.md PR6 for
// why this exists. A hand-maintained duplicate of these shapes drifted out
// of step once before, and PR2 fixed the card schema as a result.
//
// Lives inside src/ (not a top-level shared/ folder) because CRA's webpack
// build will not bundle imports from outside src/. The frontend has to be
// able to import this file without a build config change, so analysis/'s
// tsconfig is widened instead. It has no equivalent restriction.

/** One card entry as written into a Deck's `cards` array, before normalisation. */
export interface PipelineCard {
  name: string;
  count: number;
  set: string;
  number: string;
}

/** One deck list inside best-decks.json's `lists` array. Cards are encoded
 * as "count:id" strings (e.g. "2:a1-004"), not PipelineCard objects. See
 * convertCardsToIds in analysis/src/utils/convert-cards.ts. */
export interface PipelineDeckList {
  cards: string[];
  score: number;
  strength: number;
}

/** One archetype entry in best-decks.json's top-level array. */
export interface PipelinePartialDeck {
  name: string;
  lists: PipelineDeckList[];
  popularity: number;
  percentOfGames: number;
  score: number;
  /** 0..1 win rate against the 14-day field. Always present. */
  expectedWinRate: number;
  /** 0..1 share of the field this deck has usable matchup data against. */
  fieldCoverage: number;
  /** 0..100 VS-style Power Score, or null when fieldCoverage is too low. */
  powerScore: number | null;
  /** 0..100 play rate against the most-played deck. Always present. */
  freqScore: number;
  /** (powerScore + freqScore) / 2, or null when unranked. */
  metaScore: number | null;
}

/** One opponent row in matchup-data.json's per-deck array, including the
 * "Total" sentinel row that get-best-decks.ts always appends. */
export interface PipelineMatchupEntry {
  name: string;
  winRate: number;
  totalGames: number;
}

/** matchup-data.json's full shape: deck name maps to its matchup rows. */
export type PipelineMatchupData = Record<string, PipelineMatchupEntry[]>;

/** One archetype's entry in meta-share.json. */
export interface MetaShareEntry {
  name: string;
  /** 0..1 share of qualified games in the trailing 7-day window. */
  share: number;
  /** Same measure for the window ending 7 days earlier. */
  sharePrev: number;
  /** share - sharePrev; may be negative. */
  delta: number;
  /** Qualified games in the trailing 14-day window (expansion-capped). */
  games14: number;
  /** ISO date of earliest appearance in the qualified pool. */
  firstSeen: string;
  /** True when firstSeen falls inside the current 7-day window. */
  isNew: boolean;
}

/** meta-share.json's full shape, written by get-best-decks.ts each run. */
export interface PipelineMetaShare {
  generatedAt: string;
  windowDays: number;
  decks: MetaShareEntry[];
}

/** One row in card-scores.json. */
export interface PipelineCardScore {
  name: string;
  score: number;
  popularity: number;
}

/** One row in historical-trends.json. Every key other than `date` is the
 * name of one of that day's top decks (up to 6), mapped to its share of
 * games as a 0-100 percentage. Those keys are dynamic, so the row uses an
 * index signature. `totalGames` is pipeline-internal: get-best-decks.ts
 * computes it as a divisor but never writes it to the file, and nothing
 * reads it, so it is deliberately not part of the on-disk shape. */
export interface PipelineTrendRow {
  date: string;
  [deckName: string]: string | number;
}
