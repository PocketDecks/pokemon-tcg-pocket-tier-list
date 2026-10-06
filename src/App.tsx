import { Suspense, lazy } from "react";
import { Outlet, Route, Routes, useLocation } from "react-router";
import styled from "styled-components";
import { useTranslation } from "react-i18next";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./contexts/AuthContext";
import { DecksProvider } from "./contexts/DecksContext";
import AdAnchor from "./ads/AdAnchor";
import AdBlockerNotice from "./components/AdBlockerNotice";
import { ContentReadyProvider } from "./ads/ContentReadyContext";
import ErrorBoundary, { LoadingNotice } from "./components/ErrorBoundary";
import Header from "./components/Header";
import HomeBanner from "./components/HomeBanner";

const LandingPage = lazy(() => import("./pages/landing/LandingPage"));
const TierListPage = lazy(() => import("./pages/tier-list/TierListPage"));
const DeckFinderPage = lazy(() => import("./pages/deck/DeckFinderPage"));
const DeckDetailPage = lazy(() => import("./pages/deck/DeckDetailPage"));
const CardsListPage = lazy(() => import("./pages/cards-list/CardsListPage"));
const ExpansionListPage = lazy(() => import("./pages/expansion-list/ExpansionListPage"));
const StatisticsPage = lazy(() => import("./pages/stats/StatisticsPage"));
const PrivacyPage = lazy(() => import("./pages/legal/PrivacyPage"));
const AboutPage = lazy(() => import("./pages/legal/AboutPage"));
const NotFoundPage = lazy(() => import("./pages/not-found/NotFoundPage"));

export const queryClientOptions = {
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 60, // 1 hour
      gcTime: 1000 * 60 * 60 * 24, // 24 hours
    },
  },
};

const queryClient = new QueryClient(queryClientOptions);

const StyledApp = styled.div`
  width: 100%;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: var(--bg);
`;

const SkipLink = styled.a`
  position: absolute;
  top: 0.8rem;
  left: 0.8rem;
  z-index: 100;
  padding: 1.2rem 1.6rem;
  border-radius: 0.6rem;
  background: var(--focus);
  color: var(--bg);
  font-size: 1.6rem;
  font-weight: 500;
  transform: translateY(-200%);

  &:focus-visible {
    transform: none;
  }
`;

const Main = styled.main`
  width: 100%;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;

  &:focus {
    outline: none;
  }
`;

const Layout = () => {
  const { t } = useTranslation();
  const { pathname } = useLocation();

  return (
      <StyledApp>
        <SkipLink href="#main-content">{t("a11y.skipToContent")}</SkipLink>
        {pathname === "/" && <HomeBanner />}
        <Header />
        <Main id="main-content" tabIndex={-1}>
          <ErrorBoundary>
            <Suspense fallback={<LoadingNotice />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </Main>
        <Header footer />
        <AdBlockerNotice />
        <AdAnchor />
      </StyledApp>
  );
};

const App = () => {
  return (
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <DecksProvider>
              <ContentReadyProvider>
                <Routes>
                  <Route path="/" element={<Layout />}>
                    <Route index element={<LandingPage />} />
                    <Route path="tier-list" element={<TierListPage />} />
                    <Route path="cards-list" element={<CardsListPage />} />
                    <Route path="expansion-list" element={<ExpansionListPage />} />
                    <Route path="statistics" element={<StatisticsPage />} />
                    <Route path="stats" element={<StatisticsPage />} />
                    <Route path="privacy" element={<PrivacyPage />} />
                    <Route path="about" element={<AboutPage />} />
                    <Route path="404" element={<NotFoundPage />} />
                    <Route path="deck">
                      <Route index element={<DeckFinderPage />} />
                      <Route path=":deckId" element={<DeckDetailPage />} />
                    </Route>
                    <Route path="*" element={<NotFoundPage />} />
                  </Route>
                </Routes>
              </ContentReadyProvider>
            </DecksProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ErrorBoundary>
  );
};

export default App;