import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { DecksProvider } from "../../../contexts/DecksContext";
import MissingContextProvider from "../../../components/MissingContext";
import FilterContextProvider from "../../../components/FilterContext";
import { UIProvider } from "../../../contexts/UIContext";
import { ContentReadyProvider } from "../../../ads/ContentReadyContext";
import DeckDetailPage from "../DeckDetailPage";
import rawCards from "../../../app/__fixtures__/cards.json";

vi.mock("../../../app/use-is-premium", () => ({
  __esModule: true,
  default: () => true,
}));

vi.mock("../../../app/use-expansions", () => ({
  __esModule: true,
  default: () => [],
}));

// The ad slot is irrelevant to head-tag output, so stub it.
vi.mock("../../../ads/AdInContent", () => ({
  __esModule: true,
  default: () => null,
}));

// UserAccount pulls in Firebase auth; irrelevant to Helmet output, so stub it.
vi.mock("../../../components/UserAccount", () => ({
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
    powerScore: 80,
    freqScore: 50,
    metaScore: 65,
  },
];
const MATCHUP_JSON = { [DECK_ID]: [] };

const jsonResponse = (body: unknown) =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve(body),
  } as unknown as Response);

const metaContent = (selector: string, match?: string): string | null => {
  // eslint-disable-next-line testing-library/no-node-access -- asserting real head output requires querying document.head directly
  const nodes = Array.from(document.head.querySelectorAll(selector));
  const node = match
    ? nodes.find((n) => n.getAttribute("content")?.includes(match))
    : nodes[nodes.length - 1];
  return node?.getAttribute("content") ?? null;
};

describe("DeckPage head tags", () => {
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

  it("sets a per-deck title and OG tags from the friendly card names", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
          <UIProvider>
            <MissingContextProvider>
              <FilterContextProvider>
                <ContentReadyProvider>
                  <DecksProvider>
                    <MemoryRouter initialEntries={[`/deck/${DECK_ID}`]}>
                      <Routes>
                        <Route path="/deck/:deckId" element={<DeckDetailPage />} />
                      </Routes>
                    </MemoryRouter>
                  </DecksProvider>
                </ContentReadyProvider>
              </FilterContextProvider>
            </MissingContextProvider>
          </UIProvider>
        </QueryClientProvider>
    );

    await waitFor(() => expect(document.title).toContain("Venusaur ex"));

    expect(await screen.findByText(/Scan to import/i)).toBeInTheDocument();

    expect(document.title).not.toContain("a1-004");

    expect(metaContent('meta[property="og:title"]')).toContain("Venusaur ex");
    expect(metaContent('meta[property="og:url"]')).toBe(
      `https://pocketdecks.top/deck/${DECK_ID}`
    );
    expect(metaContent('meta[property="og:image"]')).toBe(
      `https://pocketdecks.top/og/deck/${DECK_ID}.png`
    );
    expect(metaContent('meta[name="description"]', "Venusaur ex")).toContain("Venusaur ex");
  });
});
