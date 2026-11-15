import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MetaWindowProvider } from "../../../contexts/MetaWindowContext";
import { ThemeProvider } from "../../../contexts/ThemeContext";
import { ContentReadyProvider } from "../../../ads/ContentReadyContext";
import StatisticsPage from "../StatisticsPage";

const { useDecks, useMatchups, usePipelineTrends } = vi.hoisted(() => ({
  useDecks: vi.fn(),
  useMatchups: vi.fn(),
  usePipelineTrends: vi.fn(),
}));

vi.mock("../../../app/use-decks", () => ({ useDecks, useMatchups }));
vi.mock("../../../app/use-is-premium", () => ({ __esModule: true, default: () => true }));
vi.mock("../../../app/use-pipeline-trends", () => ({ __esModule: true, default: usePipelineTrends }));
vi.mock("../../../app/use-expansions", () => ({ latestCoveredExpansion: () => null }));
vi.mock("../../../ads/AdInContent", () => ({ __esModule: true, default: () => null }));
vi.mock("../../../components/SeoContent", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("../../../components/PageTitle", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
}));
vi.mock("../../../components/DeckArt", () => ({ __esModule: true, default: () => null }));
vi.mock("../TrendChart", () => ({
  __esModule: true,
  default: ({
    pinnedSeries,
    onPin,
  }: {
    pinnedSeries: string | null;
    onPin: (name: string) => void;
  }) => (
    <button aria-pressed={pinnedSeries === "test-deck"} onClick={() => onPin("test-deck")}>
      pin
    </button>
  ),
}));

const decks = [{ id: "test-deck", name: "test-deck", powerScore: 80, lists: [], iconPrimary: null }];
const metaShare = { decks: [{ name: "test-deck", share: 0.1, delta: -0.05, isNew: false, windowGames: 10 }] };
const ready = { decks, metaShare, status: "ready" };
const loading = { decks: null, metaShare: null, status: "loading" };

const tree = () => (
  <QueryClientProvider client={new QueryClient()}>
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

describe("StatisticsPage state across a window load", () => {
  beforeAll(() => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    });
  });

  const reloadWindow = (rerender: (ui: React.ReactElement) => void) => {
    useDecks.mockReturnValue(loading);
    rerender(tree());
    useDecks.mockReturnValue(ready);
    rerender(tree());
  };

  const setup = () => {
    useMatchups.mockReturnValue({ matchupsByName: {}, loading: false, error: null });
    usePipelineTrends.mockReturnValue({ rows: [], isLoading: false, failed: false });
    useDecks.mockReturnValue(ready);
    return render(tree());
  };

  it("keeps the chosen movement view", () => {
    const { rerender } = setup();
    fireEvent.click(screen.getByRole("button", { name: "statistics.falling" }));
    reloadWindow(rerender);
    expect(screen.getByRole("button", { name: "statistics.falling" })).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps the pinned trend series", () => {
    const { rerender } = setup();
    fireEvent.click(screen.getByRole("button", { name: "pin" }));
    expect(screen.getByRole("button", { name: "pin" })).toHaveAttribute("aria-pressed", "true");
    reloadWindow(rerender);
    expect(screen.getByRole("button", { name: "pin" })).toHaveAttribute("aria-pressed", "true");
  });
});
