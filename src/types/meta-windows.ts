export {
  ARTEFACT_BASES,
  DEFAULT_WINDOW,
  isPremiumWindow,
  PREMIUM_BASES,
  PREMIUM_WINDOWS,
  TRIMMED_BASES,
  TRIMMED_WINDOWS,
  WINDOW_IDS,
  WINDOW_LENGTH_DAYS,
  windowArtefactName,
  windowDataFile,
} from "../../scripts/meta-windows.mjs";

import type { ARTEFACT_BASES, PREMIUM_WINDOWS, TRIMMED_BASES, WINDOW_IDS } from "../../scripts/meta-windows.mjs";

export type WindowId = (typeof WINDOW_IDS)[number];
export type PremiumWindow = (typeof PREMIUM_WINDOWS)[number];
export type ArtefactBase = (typeof ARTEFACT_BASES)[number];
export type TrimmedBase = (typeof TRIMMED_BASES)[number];
