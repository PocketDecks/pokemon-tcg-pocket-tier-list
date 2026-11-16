export const WINDOW_IDS = ["10d", "20d", "30d", "all"];

export const DEFAULT_WINDOW = "20d";

export const PREMIUM_WINDOWS = ["30d", "all"];

export const TRIMMED_WINDOWS = WINDOW_IDS.filter((window) => !PREMIUM_WINDOWS.includes(window));

/** Supporter-only windows: they have no public file. */
export const isPremiumWindow = (window) => PREMIUM_WINDOWS.includes(window);

export const WINDOW_LENGTH_DAYS = { "10d": 10, "20d": 20, "30d": 30, all: null };

// Published order of the public files.
export const ARTEFACT_BASES = ["best-decks", "meta-share", "matchup-data"];

// Alphabetical, which is the order premium artefacts are listed in.
export const PREMIUM_BASES = [...ARTEFACT_BASES].sort();

// Best decks and matchups keep their full content in the public file; only meta share is cut down.
export const TRIMMED_BASES = ["meta-share"];

/** "best-decks" + "10d" -> "best-decks-10d". */
export const windowArtefactName = (base, window) => `${base}-${window}`;

/** "best-decks" + "10d" -> "best-decks-10d.json"; the default window stays un-suffixed. */
export const windowDataFile = (base, window) =>
  window === DEFAULT_WINDOW ? `${base}.json` : `${windowArtefactName(base, window)}.json`;
