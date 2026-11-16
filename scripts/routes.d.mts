export type PageElement =
  | "landing"
  | "tierList"
  | "cardsList"
  | "expansionList"
  | "expansion"
  | "statistics"
  | "deckFinder"
  | "about"
  | "premium"
  | "privacy"
  | "feedback"
  | "deck";

export interface PageRoute {
  readonly route: string;
  readonly element: PageElement;
  readonly prerender?: true;
  readonly sitemap?: true;
  readonly ready?: true;
  readonly deckLinks?: true;
}

export const PAGE_ROUTES: readonly PageRoute[];
export const PRERENDER_ROUTES: readonly string[];
export const SITEMAP_ROUTES: readonly string[];
export const pageRouteFor: (path: string) => PageRoute | undefined;
