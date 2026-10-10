/**
 * Meta windows: the trailing periods a visitor can view the rankings through.
 *
 * Window artefacts are emitted per window id. The 20-day set is also written
 * under the un-suffixed filenames, so it is the one window that needs no
 * suffix and the one every reader falls back to.
 */
export const META_WINDOWS = ["10d", "20d", "30d", "all"] as const;

export type MetaWindow = (typeof META_WINDOWS)[number];

export const DEFAULT_META_WINDOW: MetaWindow = "20d";

const PREMIUM_META_WINDOWS: readonly MetaWindow[] = ["30d", "all"];

export const isPremiumMetaWindow = (window: MetaWindow): boolean =>
  PREMIUM_META_WINDOWS.includes(window);

/** Trailing day count per window; null means the whole store (All Time). */
export const META_WINDOW_LENGTH_DAYS: Record<MetaWindow, number | null> = {
  "10d": 10,
  "20d": 20,
  "30d": 30,
  all: null,
};

/** i18n key under `windowDays.` holding the human day label per window. */
export const META_WINDOW_LABEL_DAYS: Record<MetaWindow, string> = {
  "10d": "10d",
  "20d": "20d",
  "30d": "30d",
  all: "all",
};

export const META_WINDOW_LABEL_KEYS: Record<MetaWindow, string> = {
  "10d": "window.10d",
  "20d": "window.20d",
  "30d": "window.30d",
  all: "window.all",
};

/** "best-decks" + "10d" -> "best-decks-10d.json"; the default stays un-suffixed. */
export const metaWindowDataFile = (base: string, window: MetaWindow): string =>
  window === DEFAULT_META_WINDOW ? `${base}.json` : `${base}-${window}.json`;

export const metaWindowDataPath = (base: string, window: MetaWindow): string =>
  `/data/${metaWindowDataFile(base, window)}`;
