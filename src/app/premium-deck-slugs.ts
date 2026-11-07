import slugs from "../data/premium-deck-slugs.json";
import { isPremiumMetaWindow, parseMetaWindow, type MetaWindow } from "./meta-window";

export const PREMIUM_DECK_SLUGS: Record<string, readonly string[]> = slugs;

export const premiumWindowsForSlug = (
  slug: string,
  list: Record<string, readonly string[]> = PREMIUM_DECK_SLUGS
): MetaWindow[] => {
  if (!Object.hasOwn(list, slug)) return [];
  return list[slug]
    .map(parseMetaWindow)
    .filter((window): window is MetaWindow => window !== null && isPremiumMetaWindow(window));
};
