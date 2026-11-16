import { Suspense } from "react";
import { lazyRoute as lazy } from "./app/lazy-route";
import { Outlet, Route, Routes, useLocation } from "react-router";
import styled from "styled-components";
import { useTranslation } from "react-i18next";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./app/query-client";
import { AuthProvider } from "./contexts/AuthContext";
import { EntitlementProvider } from "./contexts/EntitlementContext";
import { DecksProvider } from "./contexts/DecksContext";
import { MetaWindowProvider } from "./contexts/MetaWindowContext";
import AdAnchor from "./ads/AdAnchor";
import AdBlockerNotice from "./components/AdBlockerNotice";
import { ContentReadyProvider } from "./ads/ContentReadyContext";
import ErrorBoundary, { LoadingNotice } from "./components/ErrorBoundary";
import Header, { RAIL_WIDTH } from "./components/Header";
import HomeBanner from "./components/HomeBanner";
import LayoutMain from "./components/LayoutMain";
import { useDocumentLanguage } from "./app/use-document-language";
import { LOCALE_PREFIXES, ROUTE_LOCALES, splitLocale } from "./app/locale-route";

const LandingPage = lazy(() => import("./pages/landing/LandingPage"));
const TierListPage = lazy(() => import("./pages/tier-list/TierListPage"));
const DeckFinderPage = lazy(() => import("./pages/deck/DeckFinderPage"));
const DeckRoute = lazy(() => import("./pages/deck/DeckRoute"));
const CardsListPage = lazy(() => import("./pages/cards-list/CardsListPage"));
const ExpansionListPage = lazy(() => import("./pages/expansion-list/ExpansionListPage"));
const ExpansionPage = lazy(() => import("./pages/expansion-list/ExpansionPage"));
const StatisticsPage = lazy(() => import("./pages/stats/StatisticsPage"));
const PrivacyPage = lazy(() => import("./pages/legal/PrivacyPage"));
const AboutPage = lazy(() => import("./pages/legal/AboutPage"));
const PremiumPage = lazy(() => import("./pages/premium/PremiumPage"));
const NotFoundPage = lazy(() => import("./pages/not-found/NotFoundPage"));
const FeedbackPage = lazy(() => import("./pages/feedback/FeedbackPage"));

export { queryClientOptions } from "./app/query-client";

const StyledApp = styled.div`
  width: 100%;
  min-height: 100dvh;
  display: grid;
  grid-template-columns: ${RAIL_WIDTH} minmax(0, 1fr);
  grid-template-rows: auto 1fr auto;
  grid-template-areas:
    "rail banner"
    "rail main"
    "rail footer";
  background: var(--bg);

  @media (max-width: 900px) {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
`;

const Banner = styled.div`
  grid-area: banner;
  width: 100%;
`;

const FooterArea = styled.div`
  grid-area: footer;
  width: 100%;
`;

const SkipLink = styled.a`
  position: absolute;
  top: 0.8rem;
  left: 0.8rem;
  z-index: 100;
  padding: 1.2rem 1.6rem;
  border-radius: 0.6rem;
  background: var(--focus);
  color: var(--on-accent);
  font-size: 1.6rem;
  font-weight: 500;
  transform: translateY(-200%);

  &:focus-visible {
    transform: none;
  }
`;

export const Layout = () => {
  const { t } = useTranslation();
  const { pathname, search } = useLocation();
  useDocumentLanguage();

  return (
      <StyledApp>
        <SkipLink href="#main-content">{t("a11y.skipToContent")}</SkipLink>
        {splitLocale(pathname).rest === "/" && (
          <Banner>
            <HomeBanner />
          </Banner>
        )}
        <Header />
        <LayoutMain id="main-content" tabIndex={-1}>
          <ErrorBoundary resetKeys={[pathname, search]}>
            <Suspense fallback={<LoadingNotice />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </LayoutMain>
        <FooterArea>
          <Header footer />
          <AdBlockerNotice />
        </FooterArea>
        <AdAnchor />
      </StyledApp>
  );
};

// Every page route lives in this fragment, once. It is mounted under each locale
// prefix in `App`, and `readAppRoutePaths` in scripts/verify-dist-html.js reads
// it as text, so keep it a `<>` block of literal `<Route path="...">` elements.
const pageRoutes = (
  <>
    <Route index element={<LandingPage />} />
    <Route path="tier-list" element={<TierListPage />} />
    <Route path="cards-list" element={<CardsListPage />} />
    <Route path="expansion-list">
      <Route index element={<ExpansionListPage />} />
      <Route path=":expansionId" element={<ExpansionPage />} />
    </Route>
    <Route path="statistics" element={<StatisticsPage />} />
    <Route path="privacy" element={<PrivacyPage />} />
    <Route path="about" element={<AboutPage />} />
    <Route path="premium" element={<PremiumPage />} />
    <Route path="feedback" element={<FeedbackPage />} />
    <Route path="deck">
      <Route index element={<DeckFinderPage />} />
      <Route path=":deckId" element={<DeckRoute />} />
    </Route>
    <Route path="*" element={<NotFoundPage />} />
  </>
);

const App = () => {
  return (
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <EntitlementProvider>
              <MetaWindowProvider>
                <DecksProvider>
                  <ContentReadyProvider>
                    <Routes>
                      {ROUTE_LOCALES.map((locale) => (
                        <Route key={locale} path={LOCALE_PREFIXES[locale] || "/"} element={<Layout />}>
                          {pageRoutes}
                        </Route>
                      ))}
                    </Routes>
                  </ContentReadyProvider>
                </DecksProvider>
              </MetaWindowProvider>
            </EntitlementProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ErrorBoundary>
  );
};

export default App;