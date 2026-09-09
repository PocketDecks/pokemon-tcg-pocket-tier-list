import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import DeckDetailPage from "../DeckDetailPage";
import { DecksProvider } from "../../../contexts/DecksContext";
import MissingContextProvider from "../../../components/MissingContext";
import i18n from "../../../i18n";
import { ContentReadyProvider } from "../../../ads/ContentReadyContext";
import FilterContextProvider from "../../../components/FilterContext";
import useFilters from "../../../app/use-filters";
import { UIProvider } from "../../../contexts/UIContext";
import rawCards from "../../../app/__fixtures__/cards.json";

vi.mock("../../../ads/AdInContent", () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock("../../../app/use-is-premium", () => ({
  __esModule: true,
  default: () => true,
}));

// UserAccount pulls the real firebase auth module; stub the hook instead of
// mounting an AuthProvider (same boundary as the App.tsx import lesson).
vi.mock("../../../contexts/AuthContext", () => ({
  __esModule: true,
  useAuth: () => ({ user: null, signOut: () => {}, signInWithGoogle: () => {} }),
}));

vi.mock("../../../app/use-expansions", () => ({
  __esModule: true,
  default: () => [],
}));

const GOOD_DECK = "venusaur-a1-004&bulbasaur-a1-001";

let decks = [
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
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve(body),
  } as unknown as Response);

const renderDetailPage = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <UIProvider>
        <MissingContextProvider>
          <FilterContextProvider>
            <DecksProvider>
              <ContentReadyProvider>
                <MemoryRouter initialEntries={["/deck/venusaur-a1-004&bulbasaur-a1-001"]}>
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

describe("DeckDetailPage with a cut card", () => {
  beforeAll(async () => {
    await i18n.init();
    await i18n.changeLanguage("en");
    await i18n.loadNamespaces("translation");
  });

  beforeEach(() => {
    decks = [
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
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(global, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("best-decks.json")) return jsonResponse(decks);
      if (url.endsWith("matchup-data.json")) return jsonResponse({});
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

  it("renders the deck normally before any cuts", async () => {
    renderDetailPage();
    expect(await screen.findByAltText("Venusaur ex")).toBeInTheDocument();
    expect(screen.queryByText("Deck not found")).not.toBeInTheDocument();
  });

  it("stays on the deck and shows Undo after cutting a card from it", async () => {
    renderDetailPage();

    // Both copies of Venusaur ex are in the list; one tap removes them all.
    const card = await screen.findByAltText("Venusaur ex");
    fireEvent.click(card);

    expect(await screen.findByText("Undo")).toBeInTheDocument();
    expect(screen.queryByText("Deck not found")).not.toBeInTheDocument();

    // Undo restores the pre-cut state.
    fireEvent.click(screen.getByText("Undo"));
    await waitFor(() => {
      expect(screen.queryByText("Undo")).not.toBeInTheDocument();
    });
    expect(screen.getByAltText("Venusaur ex")).toBeInTheDocument();
  });

  // The unfiltered all-decks build would keep a stale Venusaur ex tile after
  // the cut; only the missing-filtered resolution drops it from the grid.
  it("removes the cut card from the grid", async () => {
    renderDetailPage();

    const card = await screen.findByAltText("Venusaur ex");
    fireEvent.click(card);

    await screen.findByText("Undo");
    await waitFor(() => {
      expect(screen.queryByAltText("Venusaur ex")).not.toBeInTheDocument();
    });
    expect(screen.queryByText("Deck not found")).not.toBeInTheDocument();
  });

  it("keeps the page up when the cut kills every list of the deck", async () => {
    decks = [
      {
        name: GOOD_DECK,
        lists: [{ cards: ["2:a1-004", "2:a1-219"], score: 10, strength: 5 }],
        percentOfGames: 50,
        popularity: 100,
        powerScore: null,
        freqScore: 50,
        metaScore: null,
      },
    ];
    renderDetailPage();

    const card = await screen.findByAltText("Venusaur ex");
    fireEvent.click(card);

    expect(await screen.findByText("Undo")).toBeInTheDocument();
    expect(screen.queryByText("Deck not found")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Undo"));
    expect(await screen.findByAltText("Venusaur ex")).toBeInTheDocument();
  });

  it("shows the extinct notice and a tier-list link when no list survives", async () => {
    decks = [
      {
        name: GOOD_DECK,
        lists: [{ cards: ["2:a1-004", "2:a1-219"], score: 10, strength: 5 }],
        percentOfGames: 50,
        popularity: 100,
        powerScore: null,
        freqScore: 50,
        metaScore: null,
      },
    ];
    renderDetailPage();

    const card = await screen.findByAltText("Venusaur ex");
    fireEvent.click(card);

    expect(
      await screen.findByText(
        "That was the last copy of Venusaur ex. There is no version of this deck left to build."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("or")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "try another deck" })
    ).toHaveAttribute("href", "/tier-list");

    // Undo still restores the deck from the extinct state.
    fireEvent.click(screen.getByText("Undo"));
    expect(await screen.findByAltText("Venusaur ex")).toBeInTheDocument();
  });

  // An unrelated active filter (e.g. energy) drops the deck from the filtered
  // build without any cuts; extinction must not trigger from that.
  it("renders a valid deck normally while an unrelated filter is active", async () => {
    const EnergyToggle = () => {
      const { setEnergy } = useFilters();
      return <button onClick={() => setEnergy("Lightning")}>filter</button>;
    };
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <UIProvider>
          <MissingContextProvider>
            <FilterContextProvider>
              <DecksProvider>
                <ContentReadyProvider>
                  <MemoryRouter initialEntries={["/deck/venusaur-a1-004&bulbasaur-a1-001"]}>
                    <Routes>
                      <Route path="/deck/:deckId" element={<><DeckDetailPage /><EnergyToggle /></>} />
                    </Routes>
                  </MemoryRouter>
                </ContentReadyProvider>
              </DecksProvider>
            </FilterContextProvider>
          </MissingContextProvider>
        </UIProvider>
      </QueryClientProvider>
    );

    expect(await screen.findByAltText("Venusaur ex")).toBeInTheDocument();

    // Lightning energy excludes every Pokémon card in this fixture deck, so
    // the filtered build drops it entirely; the page must still render.
    fireEvent.click(screen.getByText("filter"));

    expect(screen.getByAltText("Venusaur ex")).toBeInTheDocument();
    expect(screen.queryByText("Deck not found")).not.toBeInTheDocument();
  });

  it("still reports an unknown deck id as not found", async () => {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MissingContextProvider>
          <DecksProvider>
            <ContentReadyProvider>
              <MemoryRouter initialEntries={["/deck/nope-a9-999"]}>
                <Routes>
                  <Route path="/deck/:deckId" element={<DeckDetailPage />} />
                </Routes>
              </MemoryRouter>
            </ContentReadyProvider>
          </DecksProvider>
        </MissingContextProvider>
      </QueryClientProvider>
    );

    await screen.findByText("Loading...");
    expect(await screen.findByText("Deck not found")).toBeInTheDocument();
  });
});
