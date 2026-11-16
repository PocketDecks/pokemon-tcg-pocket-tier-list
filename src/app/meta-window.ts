import {
  DEFAULT_WINDOW,
  PREMIUM_WINDOWS,
  WINDOW_IDS,
  WINDOW_LENGTH_DAYS,
  windowArtefactName,
  windowDataFile,
  type WindowId,
} from "../types/meta-windows";
import { loadPremiumArtefact } from "./premium-data";

export const META_WINDOWS = WINDOW_IDS;

export type MetaWindow = WindowId;

export const DEFAULT_META_WINDOW: MetaWindow = DEFAULT_WINDOW;

const PREMIUM_META_WINDOWS: readonly MetaWindow[] = PREMIUM_WINDOWS;

export const parseMetaWindow = (value: string | null): MetaWindow | null =>
  META_WINDOWS.find((window) => window === value) ?? null;

export const isPremiumMetaWindow = (window: MetaWindow): boolean =>
  PREMIUM_META_WINDOWS.includes(window);

export const META_WINDOW_LENGTH_DAYS: Record<MetaWindow, number | null> = WINDOW_LENGTH_DAYS;

export const META_WINDOW_LABEL_KEYS: Record<MetaWindow, string> = {
  "10d": "window.10d",
  "20d": "window.20d",
  "30d": "window.30d",
  all: "window.all",
};

/** "best-decks" + "10d" -> "best-decks-10d.json"; the default stays un-suffixed. */
export const metaWindowDataFile = (base: string, window: MetaWindow): string =>
  windowDataFile(base, window);

export const metaWindowDataPath = (base: string, window: MetaWindow): string =>
  `/data/${metaWindowDataFile(base, window)}`;

export const loadWindowArtefact = async (
  base: string,
  window: MetaWindow
): Promise<unknown> => {
  if (isPremiumMetaWindow(window)) {
    return loadPremiumArtefact(windowArtefactName(base, window));
  }
  const file = metaWindowDataFile(base, window);
  const response = await fetch(`/data/${file}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${file}: ${response.status} ${response.statusText}`);
  }
  return response.json();
};

export type ArtefactTier = "full" | "public";

export const loadTieredArtefact = async (
  base: string,
  window: MetaWindow,
  tier: ArtefactTier
): Promise<unknown> => {
  if (tier === "public" || isPremiumMetaWindow(window)) {
    return loadWindowArtefact(base, window);
  }
  // 10d and 20d have a public file, so any failure of the full read (denied,
  // offline, hash mismatch) falls back to it. A failed public read still throws.
  try {
    return await loadPremiumArtefact(windowArtefactName(base, window));
  } catch {
    return loadWindowArtefact(base, window);
  }
};
