import {
  buildArtefactFiles,
  DEFAULT_WINDOW,
  WINDOW_IDS,
  WindowArtefacts,
  WindowId,
} from "./build-window-artefacts";
import {
  PREMIUM_WINDOWS,
  premiumFilePath,
  premiumVersion,
  renderDataVersion,
  splitArtefactFiles,
} from "./premium-artefacts";
import {
  buildPremiumDeckSlugs,
  PREMIUM_DECK_SLUGS_FILE,
  renderPremiumDeckSlugs,
} from "./premium-deck-slugs";

export const buildRunFiles = ({
  artefacts,
  trends,
  cardScoresList,
  today,
  premiumDir,
}: {
  artefacts: Record<WindowId, WindowArtefacts>;
  trends: unknown;
  cardScoresList: unknown;
  today: Date;
  premiumDir: string;
}): Record<string, string> => {
  const { publicFiles, premiumFiles } = splitArtefactFiles(buildArtefactFiles(artefacts));
  return {
    ...publicFiles,
    ...Object.fromEntries(
      Object.entries(premiumFiles).map(([name, content]) => [
        premiumFilePath(name, premiumDir),
        content,
      ])
    ),
    "../public/data/data-version.json": renderDataVersion(premiumVersion(premiumFiles)),
    [PREMIUM_DECK_SLUGS_FILE]: renderPremiumDeckSlugs(
      buildPremiumDeckSlugs(
        Object.fromEntries(WINDOW_IDS.map((window) => [window, artefacts[window].bestDecks])),
        DEFAULT_WINDOW,
        PREMIUM_WINDOWS
      )
    ),
    "../public/data/historical-trends.json": JSON.stringify(trends, null, 2),
    "../public/data/card-scores.json": JSON.stringify(cardScoresList, null, 2),
    "../src/app/last-updated.ts": `export const LAST_UPDATED = new Date("${today.toISOString()}");`,
  };
};
