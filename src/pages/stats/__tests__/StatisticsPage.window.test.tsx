import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MetaWindowProvider } from "../../../contexts/MetaWindowContext";
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
vi.mock("../../../components/DeckArt", () => ({ __esModule: true, default: () => null }));
vi.mock("../../../app/use-expansions", () => ({ latestExpansionName: () => "" }));

const decks = [{ id: "test-deck", name: "test-deck", powerScore: 80, lists: [], iconPrimary: null }];

const renderStatistics = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ThemeProvider>
        <ContentReadyProvider>
          <MetaWindowProvider>
            <MemoryRouter>
              <StatisticsPage />
            </MemoryRouter>
          </MetaWindowProvider>
        </ContentReadyProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );

describe("StatisticsPage window selector", () => {
  afterEach(() => vi.restoreAllMocks());

  it("offers the meta window toggle alongside the trend range toggle", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: () => ({
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    });
    useDecks.mockReturnValue({ decks, metaShare: { decks: [] }, loading: false, error: null });
    useMatchups.mockReturnValue({ matchupsByName: {}, loading: false, error: null });
    usePipelineTrends.mockReturnValue({ rows: [], isLoading: false, failed: false });

    renderStatistics();

    expect(screen.getByRole("group", { name: "window.label" })).toBeInTheDocument();
  });
});
