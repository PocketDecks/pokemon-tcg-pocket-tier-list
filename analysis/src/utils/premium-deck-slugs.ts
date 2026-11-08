import { deckSlug } from "../../../src/app/deck-slug";

export const PREMIUM_DECK_SLUGS_FILE = "../src/data/premium-deck-slugs.json";

export type PremiumDeckSlugs = Record<string, string[]>;

export const buildPremiumDeckSlugs = (
  bestDecksByWindow: Record<string, readonly { name: string }[]>,
  defaultWindow: string,
  premiumWindows: readonly string[]
): PremiumDeckSlugs => {
  const offeredByDefault = new Set(
    (bestDecksByWindow[defaultWindow] ?? []).map((deck) => deckSlug(deck.name))
  );
  const windowsBySlug = new Map<string, string[]>();
  for (const window of premiumWindows) {
    for (const deck of bestDecksByWindow[window] ?? []) {
      const slug = deckSlug(deck.name);
      if (offeredByDefault.has(slug)) continue;
      const windows = windowsBySlug.get(slug) ?? [];
      if (!windows.includes(window)) windows.push(window);
      windowsBySlug.set(slug, windows);
    }
  }
  return Object.fromEntries([...windowsBySlug.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
};

export const renderPremiumDeckSlugs = (slugs: PremiumDeckSlugs): string =>
  `${JSON.stringify(
    Object.fromEntries(Object.entries(slugs).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
    null,
    2
  )}\n`;
