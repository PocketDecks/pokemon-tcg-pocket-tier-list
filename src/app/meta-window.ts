import {
  WINDOW_IDS,
  isPremiumWindow,
  windowArtefactName,
  windowDataFile,
  type WindowId,
} from "../types/meta-windows";
import { loadPremiumArtefact } from "./premium-data";

export const parseMetaWindow = (value: string | null): WindowId | null =>
  WINDOW_IDS.find((window) => window === value) ?? null;

export const META_WINDOW_LABEL_KEYS: Record<WindowId, string> = {
  "10d": "window.10d",
  "20d": "window.20d",
  "30d": "window.30d",
  all: "window.all",
};

export const metaWindowDataPath = (base: string, window: WindowId): string =>
  `/data/${windowDataFile(base, window)}`;

export const loadWindowArtefact = async (
  base: string,
  window: WindowId
): Promise<unknown> => {
  if (isPremiumWindow(window)) {
    return loadPremiumArtefact(windowArtefactName(base, window));
  }
  const file = windowDataFile(base, window);
  const response = await fetch(`/data/${file}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${file}: ${response.status} ${response.statusText}`);
  }
  return response.json();
};

export type ArtefactTier = "full" | "public";

export const loadTieredArtefact = async (
  base: string,
  window: WindowId,
  tier: ArtefactTier
): Promise<unknown> => {
  if (tier === "public" || isPremiumWindow(window)) {
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
