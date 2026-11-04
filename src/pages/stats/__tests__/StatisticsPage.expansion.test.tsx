import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MetaWindowProvider } from "../../../contexts/MetaWindowContext";
import StatisticsPage from "../StatisticsPage";
import { ThemeProvider } from "../../../contexts/ThemeContext";
import { ContentReadyProvider } from "../../../ads/ContentReadyContext";
import i18n from "../../../i18n";

const { useDecks, useMatchups, usePipelineTrends } = vi.hoisted(() => ({
  useDecks: vi.fn(),
  useMatchups: vi.fn(),
  usePipelineTrends: vi.fn(),
}));

vi.mock("../../../app/use-decks", () => ({ useDecks, useMatchups }));
vi.mock("../../../app/use-is-premium", () => ({ __esModule: true, default: () => false }));
vi.mock("../../../app/use-pipeline-trends", () => ({ __esModule: true, default: usePipelineTrends }));
vi.mock("../../../app/cards-api", () => ({ fetchCards: vi.fn().mockResolvedValue({ cards: [] }) }));
vi.mock("../../../ads/AdInContent", () => ({ __esModule: true, default: () => null }));
vi.mock("../TrendChart", () => ({ __esModule: true, default: () => null }));
vi.mock("../../../components/PageTitle", () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1> }));
vi.mock("../../../components/DeckArt", () => ({ __esModule: true, default: () => null }));

const feedDeck = (cards: string[]) => ({
  id: "feed-deck",
  name: "feed-deck",
  powerScore: 80,
  lists: [{ cards, score: 0, strength: 0, energyIds: [], deckCode: null }],
  iconPrimary: null,
});

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

const setDecks = (decks: unknown[] | null) => {
  useDecks.mockReturnValue({ decks, metaShare: { decks: [] }, loading: decks === null, error: null });
  useMatchups.mockReturnValue({ matchupsByName: {}, loading: false, error: null });
  usePipelineTrends.mockReturnValue({ rows: [], isLoading: false, failed: false });
};

beforeAll(async () => {
  await i18n.changeLanguage("en");
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
  });
});

describe("StatisticsPage intro", () => {
  it("names the expansion the decks feed covers", () => {
    setDecks([feedDeck(["2:c1-018"])]);
    renderStatistics();
    expect(screen.getByText(/within the Dual Fusion format/)).toBeTruthy();
  });

  it("uses the generic intro, with no set name, while no expansion is covered", () => {
    setDecks([feedDeck(["2:zz9-001"])]);
    renderStatistics();
    expect(screen.getByText(/Analyse the current Pokémon TCG Pocket metagame/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Dual Fusion/);
  });

  it("uses the generic intro while decks are loading", () => {
    setDecks(null);
    renderStatistics();
    expect(document.body.textContent).not.toMatch(/Dual Fusion/);
    expect(screen.getByText(/Analyse the current Pokémon TCG Pocket metagame/)).toBeTruthy();
  });
});
