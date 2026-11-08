import { DEFAULT_META_WINDOW, type MetaWindow } from "./meta-window";

export const deckHref = (slug: string, window: MetaWindow): string =>
  window === DEFAULT_META_WINDOW ? `/deck/${slug}` : `/deck/${slug}?window=${window}`;
