import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import DeckDetailPage from "../DeckDetailPage";
import { DecksProvider } from "../../../contexts/DecksContext";
import MissingContextProvider from "../../../components/MissingContext";
import FilterContextProvider from "../../../components/FilterContext";
import { UIProvider } from "../../../contexts/UIContext";
import { ContentReadyProvider } from "../../../ads/ContentReadyContext";
import i18n from "../../../i18n";
import rawCards from "../../../app/__fixtures__/cards-full-v510.json";
import realDecks from "../../../../public/data/best-decks.json";
import { deckSlug } from "../../../app/deck-slug";
import { cardToId } from "../../../app/deck-filters";
import { cardThumbUrl } from "../../../app/deck-thumb";

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

const jsonResponse = (body: unknown) =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve(body),
  } as unknown as Response);

beforeAll(async () => {
  await i18n.init();
  await i18n.changeLanguage("en");
  await i18n.loadNamespaces("translation");
});

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(global, "fetch").mockImplementation((input) => {
    const url = String(input);
    if (url.endsWith("best-decks.json")) return jsonResponse(realDecks);
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

const renderDeck = (deckId: string) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <UIProvider>
        <MissingContextProvider>
          <FilterContextProvider>
            <DecksProvider>
              <ContentReadyProvider>
                <MemoryRouter initialEntries={[`/deck/${deckId}`]}>
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

// The cut-card visibility invariant, proved against the real pipeline output:
// whatever a cut does to a deck's rank, trim eligibility or filter survival,
// the cut card must not stay on screen. Hand-picked fixtures need a lucky
// guess to hit the deck/card combination that trips the trim; every deck's
// lead card sweeps the whole space.
describe.each(
  (realDecks as { name: string; lists: { cards: string[]; score: number }[] }[]).map(
    (d) => {
      const cutCardId = cardToId(
        d.lists.reduce((a, b) => (b.score > a.score ? b : a)).cards[0]
      );
      return {
        deckId: deckSlug(d.name),
        name: d.name,
        cutCardId,
        cutCardImage: cardThumbUrl(cutCardId, 240),
      };
    }
  )
)("$name", ({ deckId, cutCardId, cutCardImage }) => {
  it(`cutting ${cutCardId} removes it from the grid`, async () => {
    renderDeck(deckId);

    // Card names repeat across printings, so the tile is located by its
    // image URL, which is unique per id. The tile is the button holding the
    // img, with the copy count as its text.
    const tileOf = () =>
      screen
        .getAllByRole("button")
        .find((b) =>
          within(b)
            .queryAllByRole("img")
            .some((img) => img.getAttribute("src") === cutCardImage)
        );
    const tile = await waitFor(() => {
      const found = tileOf();
      expect(found).toBeDefined();
      return found!;
    });
    const before = Number(tile.textContent);
    expect(before).toBeGreaterThan(0);

    fireEvent.click(tile);

    // A cut can drop the deck to a list still carrying one copy of the card
    // (affordable at 1 <= 2 - missing), so visibility alone is not the
    // invariant. The copy count on the tile must strictly decrease.
    await screen.findByText("Undo");
    await waitFor(() => {
      const after = tileOf();
      if (!after) return;
      expect(Number(after.textContent)).toBeLessThan(before);
    });
  }, 10000);
});
