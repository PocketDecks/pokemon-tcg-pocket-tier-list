import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { DecksProvider } from "../../../contexts/DecksContext";
import MissingContextProvider from "../../../components/MissingContext";
import FilterContextProvider from "../../../components/FilterContext";
import { UIProvider } from "../../../contexts/UIContext";
import { ContentReadyProvider } from "../../../ads/ContentReadyContext";
import DeckFinderPage from "../DeckFinderPage";
import i18n from "../../../i18n";
import rawCards from "../../../app/__fixtures__/cards.json";

vi.mock("../../../app/use-is-premium", () => ({
  __esModule: true,
  default: () => true,
}));

vi.mock("../../../app/use-expansions", () => ({
  __esModule: true,
  default: () => [],
}));

vi.mock("../../../ads/AdInContent", () => ({
  __esModule: true,
  default: () => null,
}));

const DECK_ID = "venusaur-a1-004&bulbasaur-a1-001";
const DECKS_JSON = [
  {
    name: DECK_ID,
    lists: [{ cards: ["2:a1-004", "1:a1-219"], score: 10, strength: 5 }],
    percentOfGames: 50,
    popularity: 100,
    expectedWinRate: 0.5,
    fieldCoverage: 1,
    powerScore: 80,
    freqScore: 100,
    metaScore: 90,
  },
];
const MATCHUP_JSON = { [DECK_ID]: [] };
const BASELINE_DECK_ID = "bulbasaur-a1-001";
const GLOBAL_LEADER_ID = "venusaur-a1-004";
const GLOBAL_DECKS_JSON = [
  {
    name: BASELINE_DECK_ID,
    lists: [{ cards: ["1:a1-219"], score: 10, strength: 5 }],
    percentOfGames: 50,
    popularity: 100,
    expectedWinRate: 0.5,
    fieldCoverage: 1,
    powerScore: 80,
    freqScore: 100,
    metaScore: 90,
  },
  {
    name: GLOBAL_LEADER_ID,
    lists: [{ cards: ["2:a1-004"], score: 11, strength: 6 }],
    percentOfGames: 60,
    popularity: 110,
    expectedWinRate: 0.5,
    fieldCoverage: 1,
    powerScore: 100,
    freqScore: 100,
    metaScore: 100,
  },
];

const jsonResponse = (body: unknown) =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve(body),
  } as unknown as Response);

const renderFinder = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <UIProvider>
        <MissingContextProvider>
          <FilterContextProvider>
            <ContentReadyProvider>
              <DecksProvider>
                <MemoryRouter initialEntries={["/deck"]}>
                  <Routes>
                    <Route path="/deck" element={<DeckFinderPage />} />
                  </Routes>
                </MemoryRouter>
              </DecksProvider>
            </ContentReadyProvider>
          </FilterContextProvider>
        </MissingContextProvider>
      </UIProvider>
    </QueryClientProvider>
  );

describe("DeckFinderPage", () => {
  beforeAll(async () => {
    await i18n.init();
    await i18n.changeLanguage("en");
    await i18n.loadNamespaces("translation");
  });

  beforeEach(() => {
    vi.spyOn(global, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("best-decks.json")) return jsonResponse(DECKS_JSON);
      if (url.endsWith("matchup-data.json")) return jsonResponse(MATCHUP_JSON);
      if (url.endsWith("meta-share.json"))
        return jsonResponse({
          generatedAt: "2026-08-24T00:00:00Z",
          windowDays: 7,
          decks: [],
        });
      return jsonResponse(rawCards);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a loading placeholder while matchup data loads", async () => {
    let resolveMatchups!: (response: Response) => void;
    vi.spyOn(global, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("best-decks.json")) return jsonResponse(DECKS_JSON);
      if (url.endsWith("matchup-data.json"))
        return new Promise((resolve) => { resolveMatchups = resolve; });
      if (url.endsWith("meta-share.json"))
        return jsonResponse({ generatedAt: "2026-08-24T00:00:00Z", windowDays: 7, decks: [] });
      return jsonResponse(rawCards);
    });
    renderFinder();

    expect(await screen.findByRole("button", { name: /Venusaur ex/ })).toBeInTheDocument();
    expect(screen.getAllByRole("status", { name: "Loading matchup" }).length).toBeGreaterThan(0);
    resolveMatchups(jsonResponse(MATCHUP_JSON) as unknown as Response);
  });

  it("shows an unavailable message when matchup data fails", async () => {
    vi.spyOn(global, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("best-decks.json")) return jsonResponse(DECKS_JSON);
      if (url.endsWith("matchup-data.json")) return Promise.reject(new Error("network down"));
      if (url.endsWith("meta-share.json"))
        return jsonResponse({ generatedAt: "2026-08-24T00:00:00Z", windowDays: 7, decks: [] });
      return jsonResponse(rawCards);
    });
    renderFinder();

    expect(await screen.findAllByText("Matchup data didn't load. Refresh the page to try again.")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Venusaur ex/ })).toBeInTheDocument();
  });

  it("uses the tier-list leader as the relative-strength baseline", async () => {
    vi.spyOn(global, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("best-decks.json")) return jsonResponse(GLOBAL_DECKS_JSON);
      if (url.endsWith("matchup-data.json"))
        return jsonResponse({ [BASELINE_DECK_ID]: [], [GLOBAL_LEADER_ID]: [] });
      if (url.endsWith("meta-share.json"))
        return jsonResponse({ generatedAt: "2026-08-24T00:00:00Z", windowDays: 7, decks: [] });
      return jsonResponse(rawCards);
    });
    renderFinder();

    fireEvent.click(await screen.findByRole("button", { name: /Venusaur ex/ }));
    expect(await screen.findByText("Relative Strength 80%")).toBeInTheDocument();
  });

  it("hides relative strength for an unranked recommendation", async () => {
    vi.spyOn(global, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("best-decks.json"))
        return jsonResponse([{ ...DECKS_JSON[0], powerScore: null, metaScore: null }]);
      if (url.endsWith("matchup-data.json")) return jsonResponse(MATCHUP_JSON);
      if (url.endsWith("meta-share.json"))
        return jsonResponse({ generatedAt: "2026-08-24T00:00:00Z", windowDays: 7, decks: [] });
      return jsonResponse(rawCards);
    });
    renderFinder();

    expect(await screen.findByAltText("Venusaur ex")).toBeInTheDocument();
    expect(screen.queryByText(/^Relative Strength/)).not.toBeInTheDocument();
  });

  it("shows the empty state after removing a needed card, and restores on undo", async () => {
    renderFinder();

    const venusaur = await screen.findByRole("button", {
      name: /Venusaur ex/,
    });

    // Removing one of its two copies makes the only deck unaffordable.
    fireEvent.click(venusaur);

    expect(await screen.findByText("¯\\_(ツ)_/¯")).toBeInTheDocument();

    const undo = await screen.findByRole("button", { name: "Undo" });
    expect(undo).toBeEnabled();

    fireEvent.click(undo);

    expect(await screen.findByAltText("Venusaur ex")).toBeInTheDocument();
    expect(screen.queryByText("¯\\_(ツ)_/¯")).not.toBeInTheDocument();
  });
});
