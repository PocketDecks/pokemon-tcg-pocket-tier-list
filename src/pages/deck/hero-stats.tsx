import type { TFunction } from "i18next";
import type { DeckHeroStat } from "./DeckHero";
import EnergyList from "./EnergyList";
import { WinRatePlaceholder } from "./deck-page.styles";

interface HeroStatInput {
  t: TFunction;
  /// "loading" shows a placeholder, null hides the stat.
  winRatePct: number | "loading" | null;
  metaShare: number | undefined;
  energyIds: number[];
}

export const buildHeroStats = ({ t, winRatePct, metaShare, energyIds }: HeroStatInput): DeckHeroStat[] => [
  ...(winRatePct === "loading"
    ? [{ label: t("deckPage.winRate"), value: <WinRatePlaceholder aria-hidden="true" data-testid="win-rate-placeholder" /> }]
    : winRatePct !== null
      ? [{ label: t("deckPage.winRate"), value: `${winRatePct}%` }]
      : []),
  ...(metaShare !== undefined
    ? [{ label: t("deckPage.metaShare"), value: `${(metaShare * 100).toFixed(1)}%` }]
    : []),
  ...(energyIds.length > 0
    ? [{ label: t("deckPage.energyUsed"), value: <EnergyList energyIds={energyIds} /> }]
    : []),
];
