import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MetaWindowProvider } from "../../../contexts/MetaWindowContext";
import { DecksProvider } from "../../../contexts/DecksContext";
import StatisticsPage from "../StatisticsPage";
import { ThemeProvider } from "../../../contexts/ThemeContext";
import { ContentReadyProvider } from "../../../ads/ContentReadyContext";
import i18n from "../../../i18n";
import rawCards from "../../../app/__fixtures__/cards.json";

const state = vi.hoisted(() => ({
  isPremium: false as boolean | null,
  loadPremiumArtefact: vi.fn(),
}));

vi.mock("../../../app/use-is-premium", () => ({
  __esModule: true,
  default: () => state.isPremium,
}));
vi.mock("../../../app/premium-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../app/premium-data")>();
  return { ...actual, loadPremiumArtefact: state.loadPremiumArtefact };
});
vi.mock("../../../app/use-pipeline-trends", () => ({
  __esModule: true,
  default: () => ({ rows: [], isLoading: false, failed: false }),
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

const names = Array.from({ length: 12 }, (_, index) => `venusaur-a1-004&pikachu-a1-0${10 + index}`);

const decks = names.map((name, index) => ({
  name,
  lists: [{ cards: ["2:a1-004", "1:a1-219"], score: 10, strength: 5 }],
  percentOfGames: 50 - index,
  popularity: 100 - index,
  expectedWinRate: 0.5,
  fieldCoverage: 1,
  powerScore: 100 - index,
  freqScore: 50,
  metaScore: 50,
}));

const movingEntry = (name: string, index: number) => ({
  name,
  share: 0.1 - index * 0.005,
  sharePrev: 0.05,
  delta: 0.05 - index * 0.002,
  windowGames: 100,
  firstSeen: "2026-01-01",
  isNew: false,
});

const fullShare = {
  generatedAt: "x",
  windowDays: 20,
  decks: names.map(movingEntry),
};

const publicShare = {
  ...fullShare,
  decks: fullShare.decks.map((entry, index) =>
    index < 10 ? entry : { name: entry.name, share: entry.share, windowGames: entry.windowGames }
  ),
};

const fullMatchups = Object.fromEntries(
  names.map((name, index) => [
    name,
    [{ name: names[(index + 1) % 12], winRate: 0.6, totalGames: 50 }, { name: "Total", winRate: 0.55, totalGames: 300 }],
  ])
);

const publicMatchups = Object.fromEntries(
  names.map((name, index) => [name, index < 10 ? fullMatchups[name] : [{ name: "Total", winRate: 0.55, totalGames: 300 }]])
);

const withUnresolvableDeck = (index: number) =>
  decks.map((deck, position) =>
    position === index ? { ...deck, lists: [{ cards: ["2:zz-999"], score: 10, strength: 5 }] } : deck
  );

const jsonResponse = (body: unknown) =>
  Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as unknown as Response);

const renderPage = () =>
  render(
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

const matrixRows = async () => {
  const header = await screen.findByText("Deck Archetype");
  return within(header.closest("table")!).getAllByRole("row").length - 1;
};

const movementSection = async () => (await screen.findByText("Meta movement")).closest("section")!;

const NOTE = /Movement is shown for the top 10 decks/;

describe("StatisticsPage free tier", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    });
  });

  beforeEach(() => {
    state.isPremium = false;
    state.loadPremiumArtefact.mockImplementation(async (name: string) =>
      name.startsWith("matchup-data") ? fullMatchups : fullShare
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(global, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("best-decks.json")) return jsonResponse(decks);
      if (url.endsWith("matchup-data.json")) return jsonResponse(publicMatchups);
      if (url.endsWith("meta-share.json")) return jsonResponse(publicShare);
      return jsonResponse(rawCards);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("limits the matrix to the ten free decks for a free viewer", async () => {
    renderPage();

    expect(await matrixRows()).toBe(10);
  });

  it("does not backfill the matrix with a deck outside the free set when a free deck drops out", async () => {
    vi.spyOn(global, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("best-decks.json")) return jsonResponse(withUnresolvableDeck(2));
      if (url.endsWith("matchup-data.json")) return jsonResponse(publicMatchups);
      if (url.endsWith("meta-share.json")) return jsonResponse(publicShare);
      return jsonResponse(rawCards);
    });
    renderPage();

    expect(await matrixRows()).toBe(9);
  });

  it("shows the whole field in the matrix to a premium viewer", async () => {
    state.isPremium = true;
    renderPage();

    await waitFor(async () => expect(await matrixRows()).toBe(12));
  });

  it("lists only decks that carry movement for a free viewer and says why", async () => {
    renderPage();

    const section = await movementSection();
    await waitFor(() => expect(within(section).getAllByRole("row")).toHaveLength(11));
    expect(within(section).getByText(NOTE)).toBeInTheDocument();
    expect(within(section).getByRole("link", { name: "See Premium" })).toHaveAttribute(
      "href",
      "/about#premium"
    );
  });

  it("lists every deck with movement and no note for a premium viewer", async () => {
    state.isPremium = true;
    renderPage();

    const section = await movementSection();
    await waitFor(() => expect(within(section).getAllByRole("row")).toHaveLength(13));
    expect(within(section).queryByText(NOTE)).not.toBeInTheDocument();
  });
});
