const cached = <T,>(loader: () => Promise<T>): (() => Promise<T>) => {
  let promise: ReturnType<typeof loader> | undefined;
  return () => (promise ??= loader());
};

export const loadLandingPage = cached(() => import("../pages/landing/LandingPage"));
export const loadTierListPage = cached(() => import("../pages/tier-list/TierListPage"));
export const loadDeckFinderPage = cached(() => import("../pages/deck/DeckFinderPage"));
export const loadDeckDetailPage = cached(() => import("../pages/deck/DeckDetailPage"));
export const loadCardsListPage = cached(() => import("../pages/cards-list/CardsListPage"));
export const loadExpansionListPage = cached(() => import("../pages/expansion-list/ExpansionListPage"));
export const loadStatisticsPage = cached(() => import("../pages/stats/StatisticsPage"));
export const loadPrivacyPage = cached(() => import("../pages/legal/PrivacyPage"));
export const loadAboutPage = cached(() => import("../pages/legal/AboutPage"));
export const loadFeedbackPage = cached(() => import("../pages/feedback/FeedbackPage"));
export const loadNotFoundPage = cached(() => import("../pages/not-found/NotFoundPage"));
