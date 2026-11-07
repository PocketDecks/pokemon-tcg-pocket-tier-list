import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import DeckDetailPage from "../DeckDetailPage";
import { DecksProvider } from "../../../contexts/DecksContext";
import { MetaWindowProvider } from "../../../contexts/MetaWindowContext";
import MissingContextProvider from "../../../components/MissingContext";
import i18n from "../../../i18n";
import { ContentReadyProvider } from "../../../ads/ContentReadyContext";
import FilterContextProvider from "../../../components/FilterContext";
import { UIProvider } from "../../../contexts/UIContext";
import rawCards from "../../../app/__fixtures__/cards.json";

vi.mock("../../../ads/AdInContent", () => ({ __esModule: true, default: () => null }));

vi.mock("../../../app/use-is-premium", () => ({ __esModule: true, default: () => true }));

vi.mock("../../../contexts/AuthContext", () => ({
  __esModule: true,
  useAuth: () => ({ user: null, signOut: () => {}, signInWithGoogle: () => {} }),
}));

vi.mock("../../../app/use-expansions", () => ({ __esModule: true, default: () => [] }));

const GOOD_DECK = "venusaur-a1-004&bulbasaur-a1-001";

const decks = [
  {
    name: GOOD_DECK,
    lists: [{ cards: ["2:a1-004", "1:a1-219"], score: 10, strength: 5 }],
    percentOfGames: 50,
    popularity: 100,
    powerScore: null,
    freqScore: 50,
    metaScore: null,
  },
];

const jsonResponse = (body: unknown) =>
  Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as unknown as Response);

const SearchProbe = () => <p data-testid="search">{useLocation().search}</p>;

const renderDetailPage = (entry: string, initialWindow: "10d" | "20d") =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <UIProvider>
        <MissingContextProvider>
          <FilterContextProvider>
            <MetaWindowProvider initialWindow={initialWindow}>
              <DecksProvider>
                <ContentReadyProvider>
                  <MemoryRouter initialEntries={[entry]}>
                    <Routes>
                      <Route
                        path="/deck/:deckId"
                        element={
                          <>
                            <DeckDetailPage />
                            <SearchProbe />
                          </>
                        }
                      />
                    </Routes>
                  </MemoryRouter>
                </ContentReadyProvider>
              </DecksProvider>
            </MetaWindowProvider>
          </FilterContextProvider>
        </MissingContextProvider>
      </UIProvider>
    </QueryClientProvider>
  );

describe("DeckDetailPage window parameter", () => {
  beforeAll(async () => {
    await i18n.init();
    await i18n.changeLanguage("en");
    await i18n.loadNamespaces("translation");
  });

  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(global, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (/best-decks(-10d)?\.json$/.test(url)) return jsonResponse(decks);
      if (/matchup-data(-10d)?\.json$/.test(url)) return jsonResponse({});
      if (/meta-share(-10d)?\.json$/.test(url))
        return jsonResponse({ generatedAt: "2026-08-24T00:00:00Z", windowDays: 10, decks: [] });
      return jsonResponse(rawCards);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("adds the selected window to the URL once the deck is showing", async () => {
    renderDetailPage(`/deck/${GOOD_DECK}`, "10d");

    expect(await screen.findByAltText("Venusaur ex")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("search")).toHaveTextContent("?window=10d"));
  });

  it("keeps the URL free of the parameter in the default window", async () => {
    renderDetailPage(`/deck/${GOOD_DECK}?window=20d`, "20d");

    expect(await screen.findByAltText("Venusaur ex")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("search").textContent).toBe(""));
  });
});
