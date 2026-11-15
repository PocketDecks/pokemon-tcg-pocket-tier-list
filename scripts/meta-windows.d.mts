export const WINDOW_IDS: readonly ["10d", "20d", "30d", "all"];
export const DEFAULT_WINDOW: "20d";
export const PREMIUM_WINDOWS: readonly ["30d", "all"];
export const TRIMMED_WINDOWS: readonly ["10d", "20d"];
export const WINDOW_LENGTH_DAYS: {
  readonly "10d": 10;
  readonly "20d": 20;
  readonly "30d": 30;
  readonly all: null;
};
export const ARTEFACT_BASES: readonly ["best-decks", "meta-share", "matchup-data"];
export const PREMIUM_BASES: readonly ["best-decks", "matchup-data", "meta-share"];
export const TRIMMED_BASES: readonly ["meta-share"];
export const windowArtefactName: (base: string, window: string) => string;
export const windowDataFile: (base: string, window: string) => string;
