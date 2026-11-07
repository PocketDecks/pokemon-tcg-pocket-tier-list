import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import DeckDetailPage from "../DeckDetailPage";
import { DecksProvider } from "../../../contexts/DecksContext";
import MissingContextProvider from "../../../components/MissingContext";
import i18n from "../../../i18n";
import { ContentReadyProvider } from "../../../ads/ContentReadyContext";
import FilterContextProvider from "../../../components/FilterContext";
import { UIProvider } from "../../../contexts/UIContext";
import rawCards from "../../../app/__fixtures__/cards.json";

const premium = vi.hoisted(() => ({
  isPremium: false as boolean | null,
  loadPremiumArtefact: vi.fn(),
}));

vi.mock("../../../ads/AdInContent", () => ({ __esModule: true, default: () => null }));

vi.mock("../../../app/use-is-premium", () => ({
  __esModule: true,
  default: () => premium.isPremium,
}));

vi.mock("../../../contexts/AuthContext", () => ({
  __esModule: true,
  useAuth: () => ({ user: null, signOut: () => {}, signInWithGoogle: () => {} }),
}));

vi.mock("../../../app/use-expansions", () => ({ __esModule: true, default: () => [] }));

vi.mock("../../../app/premium-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../app/premium-data")>();
  return { ...actual, loadPremiumArtefact: premium.loadPremiumArtefact };
});

const names = Array.from({ length: 12 }, (_, index) => `venusaur-a1-004&pikachu-a1-0${10 + index}`);
const FREE_DECK = names[0];
const OTHER_DECK = names[10];

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

const rowsFor = (index: number) => [
  { name: names[(index + 1) % 12], winRate: 0.7, totalGames: 50 },
  { name: names[(index + 2) % 12], winRate: 0.3, totalGames: 50 },
  { name: "Total", winRate: 0.55, totalGames: 400 },
];

const fullMatchups = Object.fromEntries(names.map((name, index) => [name, rowsFor(index)]));
const publicMatchups = Object.fromEntries(
  names.map((name, index) => [
    name,
    index < 10 ? rowsFor(index) : [{ name: "Total", winRate: 0.55, totalGames: 400 }],
  ])
);

const jsonResponse = (body: unknown) =>
  Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as unknown as Response);

const renderDetailPage = (deck: string) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <UIProvider>
        <MissingContextProvider>
          <FilterContextProvider>
            <DecksProvider>
              <ContentReadyProvider>
                <MemoryRouter initialEntries={[`/deck/${deck}`]}>
                  <Routes>
                    <Route path="/deck/:deckId" element={<DeckDetailPage />} />
                  </Routes>
                </MemoryRouter>
              </ContentReadyProvider>
            </DecksProvider>
          </FilterContextProvider>
        </MissingContextProvider>
      </UIProvider>
    </QueryClientProvider>
  );

const NOTICE = /Matchups for this deck are part of Premium/;

describe("DeckDetailPage matchups by tier", () => {
  beforeAll(async () => {
    await i18n.init();
    await i18n.changeLanguage("en");
    await i18n.loadNamespaces("translation");
  });

  beforeEach(() => {
    premium.isPremium = false;
    premium.loadPremiumArtefact.mockImplementation(async (name: string) =>
      name.startsWith("matchup-data") ? fullMatchups : { generatedAt: "x", windowDays: 20, decks: [] }
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(global, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("best-decks.json")) return jsonResponse(decks);
      if (url.endsWith("matchup-data.json")) return jsonResponse(publicMatchups);
      if (url.endsWith("meta-share.json")) {
        return jsonResponse({ generatedAt: "x", windowDays: 20, decks: [] });
      }
      return jsonResponse(rawCards);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("shows a free viewer the strong and weak matchups of a free deck", async () => {
    renderDetailPage(FREE_DECK);

    expect(await screen.findByText("Strong Against")).toBeInTheDocument();
    expect(await screen.findByText("70%")).toBeInTheDocument();
    expect(screen.getByText("30%")).toBeInTheDocument();
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  it("shows a free viewer a Premium notice instead of the matchups of any other deck", async () => {
    renderDetailPage(OTHER_DECK);

    expect(await screen.findByText(NOTICE)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See Premium" })).toHaveAttribute("href", "/about#premium");
    expect(screen.queryByText("70%")).not.toBeInTheDocument();
    expect(screen.queryByText("30%")).not.toBeInTheDocument();
    expect(screen.queryByText("Strong Against")).not.toBeInTheDocument();
    expect(screen.queryByText("Weak Against")).not.toBeInTheDocument();
  });

  it("shows a premium viewer the matchups of every deck, read from the full artefact", async () => {
    premium.isPremium = true;
    renderDetailPage(OTHER_DECK);

    expect(await screen.findByText("70%")).toBeInTheDocument();
    expect(screen.getByText("30%")).toBeInTheDocument();
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
    expect(premium.loadPremiumArtefact).toHaveBeenCalledWith("matchup-data-20d");
  });

  it("holds the notice back while premium is unknown", async () => {
    premium.isPremium = null;
    renderDetailPage(OTHER_DECK);

    await waitFor(() => expect(screen.getByText("Key Stats")).toBeInTheDocument());
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
    expect(screen.queryByText("70%")).not.toBeInTheDocument();
  });

  it("no longer blurs any matchup list", async () => {
    renderDetailPage(FREE_DECK);

    const label = await screen.findByText("70%");
    let node: HTMLElement | null = label;
    while (node) {
      expect(getComputedStyle(node).filter).not.toContain("blur");
      node = node.parentElement;
    }
    const css = Array.from(document.styleSheets)
      .flatMap((sheet) => Array.from(sheet.cssRules))
      .map((rule) => rule.cssText)
      .join("\n");
    expect(css).not.toContain("blur(");
  });
});
