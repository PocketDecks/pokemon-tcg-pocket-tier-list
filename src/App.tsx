import { Suspense, lazy } from "react";
import { Outlet, Route, Routes, useLocation } from "react-router";
import styled from "styled-components";
import { useTranslation } from "react-i18next";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./contexts/AuthContext";
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
const FeedbackPage = lazy(() => import("./pages/feedback/FeedbackPage"));

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
  const { pathname } = useLocation();
  useDocumentLanguage();

  return (
      <StyledApp>
        <SkipLink href="#main-content">{t("a11y.skipToContent")}</SkipLink>
        {pathname === "/" && (
          <Banner>
            <HomeBanner />
          </Banner>
        )}
        <Header />
        <LayoutMain id="main-content" tabIndex={-1}>
          <ErrorBoundary>
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

const App = () => {
  return (
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <MetaWindowProvider>
              <DecksProvider>
                <ContentReadyProvider>
                  <Routes>
                    <Route path="/" element={<Layout />}>
                      <Route index element={<LandingPage />} />
                      <Route path="tier-list" element={<TierListPage />} />
                      <Route path="cards-list" element={<CardsListPage />} />
                      <Route path="expansion-list" element={<ExpansionListPage />} />
                      <Route path="statistics" element={<StatisticsPage />} />
                      <Route path="privacy" element={<PrivacyPage />} />
                      <Route path="about" element={<AboutPage />} />
                      <Route path="feedback" element={<FeedbackPage />} />
                      <Route path="deck">
                        <Route index element={<DeckFinderPage />} />
                        <Route path=":deckId" element={<DeckDetailPage />} />
                      </Route>
                      <Route path="*" element={<NotFoundPage />} />
                    </Route>
                    <Route path="/ja" element={<Layout />}>
                      <Route index element={<LandingPage />} />
                      <Route path="tier-list" element={<TierListPage />} />
                      <Route path="cards-list" element={<CardsListPage />} />
                      <Route path="expansion-list" element={<ExpansionListPage />} />
                      <Route path="statistics" element={<StatisticsPage />} />
                      <Route path="privacy" element={<PrivacyPage />} />
                      <Route path="about" element={<AboutPage />} />
                      <Route path="feedback" element={<FeedbackPage />} />
                      <Route path="deck">
                        <Route index element={<DeckFinderPage />} />
                        <Route path=":deckId" element={<DeckDetailPage />} />
                      </Route>
                      <Route path="*" element={<NotFoundPage />} />
                    </Route>
                  </Routes>
                </ContentReadyProvider>
              </DecksProvider>
            </MetaWindowProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ErrorBoundary>
  );
};

export default App;