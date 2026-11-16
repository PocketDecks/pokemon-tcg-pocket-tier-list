import slugs from "../data/premium-deck-slugs.json";
import { isPremiumWindow, type WindowId } from "../types/meta-windows";
import { parseMetaWindow } from "./meta-window";

export const PREMIUM_DECK_SLUGS: Record<string, readonly string[]> = slugs;

export const premiumWindowsForSlug = (
  slug: string,
  list: Record<string, readonly string[]> = PREMIUM_DECK_SLUGS
): WindowId[] => {
  if (!Object.hasOwn(list, slug)) return [];
  return list[slug]
    .map(parseMetaWindow)
    .filter((window): window is WindowId => window !== null && isPremiumWindow(window));
};
