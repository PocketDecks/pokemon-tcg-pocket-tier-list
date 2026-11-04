import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MetaWindowProvider } from "../../../contexts/MetaWindowContext";
import { DecksProvider } from "../../../contexts/DecksContext";
import StatisticsPage from "../StatisticsPage";
import { ThemeProvider } from "../../../contexts/ThemeContext";
import { ContentReadyProvider } from "../../../ads/ContentReadyContext";
import i18n from "../../../i18n";

const { usePipelineTrends } = vi.hoisted(() => ({ usePipelineTrends: vi.fn() }));

vi.mock("../../../app/use-is-premium", () => ({ __esModule: true, default: () => false }));
vi.mock("../../../app/use-pipeline-trends", () => ({ __esModule: true, default: usePipelineTrends }));
vi.mock("../../../app/cards-api", () => ({
  fetchCards: vi.fn().mockResolvedValue({ cards: [], attacksByDeckBuilderNr: new Map() }),
}));
vi.mock("../../../app/use-expansions", () => ({
  __esModule: true,
  default: () => [],
  latestCoveredExpansion: () => null,
}));
vi.mock("../../../ads/AdInContent", () => ({ __esModule: true, default: () => null }));
vi.mock("../TrendChart", () => ({ __esModule: true, default: () => null }));
vi.mock("../../../components/SeoContent", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("../../../components/PageTitle", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
}));
vi.mock("../../../components/DeckArt", () => ({ __esModule: true, default: () => null }));

const GOOD_DECK = "venusaur-a1-004&bulbasaur-a1-001";
const OTHER_DECK = "missingno-a1-999";
const NO_MOVEMENT = "No deck movement in this window.";

const decks = [
  { name: GOOD_DECK, lists: [{ cards: ["2:a1-004", "1:a1-219"], score: 10, strength: 5 }], percentOfGames: 50, popularity: 100 },
];

const jsonResponse = (body: unknown) =>
  Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as unknown as Response);

const renderPage = (metaShareDecks: unknown[]) => {
  vi.spyOn(global, "fetch").mockImplementation((input) => {
    const url = String(input);
    if (url.endsWith("best-decks.json")) return jsonResponse(decks);
    if (url.endsWith("meta-share.json"))
      return jsonResponse({ generatedAt: "2026-08-24T00:00:00Z", windowDays: 20, decks: metaShareDecks });
    return jsonResponse({});
  });
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ThemeProvider>
        <ContentReadyProvider>
          <MetaWindowProvider>
            <MemoryRouter>
              <DecksProvider>
                <StatisticsPage />
              </DecksProvider>
            </MemoryRouter>
          </MetaWindowProvider>
        </ContentReadyProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

const movementTab = (label: string) =>
  screen.getAllByRole("button", { name: label }).find((button) => button.hasAttribute("aria-pressed"))!;

beforeAll(async () => {
  await i18n.changeLanguage("en");
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
  });
  usePipelineTrends.mockReturnValue({ rows: [], isLoading: false, failed: false });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("StatisticsPage movement tabs", () => {
  it("shows the no-movement message on every tab when every deck in the window is new", async () => {
    renderPage([
      { name: GOOD_DECK, share: 0.1, sharePrev: 0, delta: 0.1, windowGames: 100, firstSeen: "2026-10-30", isNew: true },
      { name: OTHER_DECK, share: 0.05, sharePrev: 0, delta: 0.05, windowGames: 100, firstSeen: "2026-10-30", isNew: true },
    ]);
    for (const label of ["Rising", "Falling", "New decks"]) {
      fireEvent.click(await waitForTab(label));
      expect(await screen.findByText(NO_MOVEMENT)).toBeTruthy();
    }
  });

  it("still lists the decks on the rising and new tabs when the window is mixed", async () => {
    renderPage([
      { name: GOOD_DECK, share: 0.12, sharePrev: 0.1, delta: 0.02, windowGames: 100, firstSeen: "2026-01-01", isNew: false },
      { name: OTHER_DECK, share: 0.05, sharePrev: 0, delta: 0.05, windowGames: 100, firstSeen: "2026-10-30", isNew: true },
    ]);
    fireEvent.click(await waitForTab("Rising"));
    expect(await screen.findByRole("row", { name: /Venusaur|venusaur/i })).toBeTruthy();
    expect(screen.queryByText(NO_MOVEMENT)).toBeNull();
    fireEvent.click(movementTab("New decks"));
    expect(await screen.findByRole("row", { name: /missingno|Missingno/i })).toBeTruthy();
    expect(screen.queryByText(NO_MOVEMENT)).toBeNull();
  });
});

const waitForTab = async (label: string) => {
  await screen.findByText("Meta movement");
  return movementTab(label);
};
