import {
  loadAboutPage,
  loadCardsListPage,
  loadDeckDetailPage,
  loadDeckFinderPage,
  loadExpansionListPage,
  loadFeedbackPage,
  loadLandingPage,
  loadNotFoundPage,
  loadPrivacyPage,
  loadStatisticsPage,
  loadTierListPage,
} from "./route-loaders";

export {
  loadAboutPage,
  loadCardsListPage,
  loadDeckDetailPage,
  loadDeckFinderPage,
  loadExpansionListPage,
  loadFeedbackPage,
  loadLandingPage,
  loadNotFoundPage,
  loadPrivacyPage,
  loadStatisticsPage,
  loadTierListPage,
};

export const preloadRoute = (pathname: string) => {
  const path = pathname.replace(/^\/+|\/+$/g, "");
  if (!path) return loadLandingPage();
  if (path === "tier-list") return loadTierListPage();
  if (path === "cards-list") return loadCardsListPage();
  if (path === "expansion-list") return loadExpansionListPage();
  if (path === "statistics" || path === "stats") return loadStatisticsPage();
  if (path === "privacy") return loadPrivacyPage();
  if (path === "about") return loadAboutPage();
  if (path === "feedback") return loadFeedbackPage();
  if (path === "404") return loadNotFoundPage();
  if (path === "deck") return loadDeckFinderPage();
  if (path.startsWith("deck/")) return loadDeckDetailPage();
  return loadNotFoundPage();
};
