import { DEFAULT_WINDOW, type WindowId } from "../types/meta-windows";

export const deckHref = (slug: string, window: WindowId): string =>
  window === DEFAULT_WINDOW ? `/deck/${slug}` : `/deck/${slug}?window=${window}`;
