import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StatisticsPage from "../StatisticsPage";
import { ThemeProvider } from "../../../contexts/ThemeContext";
import { ContentReadyProvider } from "../../../ads/ContentReadyContext";

const { useDecks, useMatchups, usePipelineTrends } = vi.hoisted(() => ({
  useDecks: vi.fn(),
  useMatchups: vi.fn(),
  usePipelineTrends: vi.fn(),
}));

vi.mock("../../../app/use-decks", () => ({ useDecks, useMatchups }));
vi.mock("../../../app/use-is-premium", () => ({ __esModule: true, default: () => true }));
vi.mock("../../../app/use-pipeline-trends", () => ({ __esModule: true, default: usePipelineTrends }));
vi.mock("../../../app/cards-api", () => ({ fetchCards: vi.fn().mockResolvedValue({ cards: [] }) }));
vi.mock("../../../ads/AdInContent", () => ({ __esModule: true, default: () => null }));
vi.mock("../../../components/SeoContent", () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("../TrendChart", () => ({ __esModule: true, default: () => null }));
vi.mock("../../../components/PageTitle", () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1> }));
vi.mock("../../../components/NavIcon", () => ({ __esModule: true, default: () => null }));
vi.mock("../../../components/DeckArt", () => ({ __esModule: true, default: () => null }));
vi.mock("../../../app/use-expansions", () => ({ latestExpansionName: () => "" }));

const decks = [{ id: "test-deck", name: "test-deck", powerScore: 80, lists: [], iconPrimary: null }];

const renderStatistics = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <ThemeProvider>
      <ContentReadyProvider>
        <MemoryRouter><StatisticsPage /></MemoryRouter>
      </ContentReadyProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

describe("StatisticsPage matchups", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.routeReady;
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: () => ({
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    });
    useDecks.mockReturnValue({ decks, metaShare: { decks: [] }, loading: false, error: null });
    usePipelineTrends.mockReturnValue({ rows: [], isLoading: false, failed: false });
  });

  it("holds the route-ready attribute until the trend data has loaded", () => {
    useMatchups.mockReturnValue({ matchupsByName: {}, loading: false, error: null });
    usePipelineTrends.mockReturnValue({ rows: [], isLoading: true, failed: false });
    renderStatistics();
    expect(document.documentElement.dataset.routeReady).toBeUndefined();
  });

  it("sets the route-ready attribute once the trend data has loaded", () => {
    useMatchups.mockReturnValue({ matchupsByName: {}, loading: false, error: null });
    renderStatistics();
    expect(document.documentElement.dataset.routeReady).toBe("/");
  });

  it("sets the route-ready attribute when the trend data fails", () => {
    useMatchups.mockReturnValue({ matchupsByName: {}, loading: false, error: null });
    usePipelineTrends.mockReturnValue({ rows: [], isLoading: false, failed: true });
    renderStatistics();
    expect(document.documentElement.dataset.routeReady).toBe("/");
  });

  it("shows a loading placeholder while matchup data loads", () => {
    useMatchups.mockReturnValue({ matchupsByName: null, loading: true, error: null });
    renderStatistics();
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("deckPage.matchupsLoading");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByLabelText("Loading matchups")).not.toBeInTheDocument();
  });

  it("shows an unavailable message when matchup data fails", () => {
    useMatchups.mockReturnValue({ matchupsByName: null, loading: false, error: new Error("network down") });
    renderStatistics();
    expect(screen.getByText("deckPage.matchupsUnavailable")).toBeInTheDocument();
  });
});
