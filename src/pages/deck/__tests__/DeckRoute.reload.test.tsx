import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import DeckRoute from "../DeckRoute";
import { DecksProvider } from "../../../contexts/DecksContext";
import { MetaWindowProvider } from "../../../contexts/MetaWindowContext";
import MissingContextProvider from "../../../components/MissingContext";
import FilterContextProvider from "../../../components/FilterContext";
import { UIProvider } from "../../../contexts/UIContext";
import { ContentReadyProvider } from "../../../ads/ContentReadyContext";
import i18n from "../../../i18n";
import rawCards from "../../../app/__fixtures__/cards.json";

const PREMIUM_ONLY = "venusaur-a1-004&bulbasaur-a1-001";
const DEFAULT_ONLY = "venusaur-a1-004";

const access = vi.hoisted(() => ({
  premium: true as boolean | null,
  loadPremiumArtefact: vi.fn(),
}));

vi.mock("../../../data/premium-deck-slugs.json", () => ({
  default: { "venusaur-a1-004&bulbasaur-a1-001": ["30d"] },
}));

vi.mock("../../../app/use-is-premium", () => ({ __esModule: true, default: () => access.premium }));

vi.mock("../../../app/premium-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../app/premium-data")>();
  return { ...actual, loadPremiumArtefact: access.loadPremiumArtefact };
});

vi.mock("../../../ads/AdInContent", () => ({ __esModule: true, default: () => null }));

vi.mock("../../../contexts/AuthContext", () => ({
  __esModule: true,
  useAuth: () => ({ user: null, signOut: () => {}, signInWithGoogle: () => {} }),
}));

vi.mock("../../../app/use-expansions", () => ({ __esModule: true, default: () => [] }));

const deck = (name: string) => ({
  name,
  lists: [{ cards: ["2:a1-004", "1:a1-219"], score: 10, strength: 5 }],
  percentOfGames: 50,
  popularity: 100,
  powerScore: null,
  freqScore: 50,
  metaScore: null,
});

const jsonResponse = (body: unknown) =>
  Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as unknown as Response);

const SearchProbe = () => <p data-testid="search">{useLocation().search}</p>;

const mount = (entry: string) => {
  window.history.pushState({}, "", entry);
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <UIProvider>
        <MissingContextProvider>
          <FilterContextProvider>
            <MetaWindowProvider>
              <DecksProvider>
                <ContentReadyProvider>
                  <MemoryRouter initialEntries={[entry]}>
                    <Routes>
                      <Route
                        path="/deck/:deckId"
                        element={
                          <>
                            <DeckRoute />
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
};

let requested: string[];

beforeAll(async () => {
  await i18n.init();
  await i18n.changeLanguage("en");
  await i18n.loadNamespaces("translation");
});

beforeEach(() => {
  requested = [];
  access.premium = true;
  access.loadPremiumArtefact.mockReset();
  access.loadPremiumArtefact.mockImplementation(async (name: string) => {
    if (name === "best-decks-30d") return [deck(PREMIUM_ONLY)];
    if (name === "matchup-data-30d") return {};
    return { generatedAt: "2026-08-24T00:00:00Z", windowDays: 30, decks: [] };
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(global, "fetch").mockImplementation((input) => {
    const url = String(input);
    requested.push(url);
    if (url.endsWith("best-decks.json")) return jsonResponse([deck(DEFAULT_ONLY)]);
    if (url.endsWith("matchup-data.json")) return jsonResponse({});
    if (url.endsWith("meta-share.json"))
      return jsonResponse({ generatedAt: "2026-08-24T00:00:00Z", windowDays: 20, decks: [] });
    return jsonResponse(rawCards);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  window.history.pushState({}, "", "/");
});

describe("a deck link that only a premium window offers", () => {
  it("reloads on the same deck and window for a premium viewer", async () => {
    mount(`/deck/${PREMIUM_ONLY}?window=30d`);

    expect(await screen.findByAltText("Venusaur ex")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("search")).toHaveTextContent("?window=30d"));
    expect(access.loadPremiumArtefact).toHaveBeenCalledWith("best-decks-30d");
  });

  it("moves to the offering window when a premium viewer opens the plain link", async () => {
    mount(`/deck/${PREMIUM_ONLY}`);

    expect(await screen.findByAltText("Venusaur ex")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("search")).toHaveTextContent("?window=30d"));
  });

  it("gates a free viewer without requesting any premium data", async () => {
    access.premium = false;
    mount(`/deck/${PREMIUM_ONLY}?window=30d`);

    expect(
      await screen.findByRole("heading", { name: "This deck only appears in a Premium window" })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See Premium" })).toHaveAttribute("href", "/about/#premium");
    expect(access.loadPremiumArtefact).not.toHaveBeenCalled();
    expect(requested.some((url) => /-(30d|all)\.json$/.test(url))).toBe(false);
  });

  it("keeps a deck the default window offers on the default window for a free viewer", async () => {
    access.premium = false;
    mount(`/deck/${DEFAULT_ONLY}?window=30d`);

    expect(await screen.findByAltText("Venusaur ex")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("search").textContent).toBe(""));
  });

  it("still serves the not-found page for an unknown slug", async () => {
    mount("/deck/does-not-exist?window=30d");

    expect(await screen.findByText("404")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "This deck only appears in a Premium window" })).toBeNull();
  });
});
