import type { ReactElement } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import DeckDetailPage from "../DeckDetailPage";
import DeckFinderPage from "../DeckFinderPage";
import { DecksProvider } from "../../../contexts/DecksContext";
import MissingContextProvider from "../../../components/MissingContext";
import i18n from "../../../i18n";
import { ContentReadyProvider } from "../../../ads/ContentReadyContext";
import FilterContextProvider from "../../../components/FilterContext";
import { UIProvider } from "../../../contexts/UIContext";

vi.mock("../../../ads/AdInContent", () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock("../../../app/use-is-premium", () => ({
  __esModule: true,
  default: () => true,
}));

vi.mock("../../../contexts/AuthContext", () => ({
  __esModule: true,
  useAuth: () => ({ user: null, signOut: () => {}, signInWithGoogle: () => {} }),
}));

vi.mock("../../../app/use-expansions", () => ({
  __esModule: true,
  default: () => [],
}));

const renderWithRoute = (path: string, element: string, page: ReactElement) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <UIProvider>
        <MissingContextProvider>
          <FilterContextProvider>
            <DecksProvider>
              <ContentReadyProvider>
                <MemoryRouter initialEntries={[path]}>
                  <Routes>
                    <Route path={element} element={page} />
                  </Routes>
                </MemoryRouter>
              </ContentReadyProvider>
            </DecksProvider>
          </FilterContextProvider>
        </MissingContextProvider>
      </UIProvider>
    </QueryClientProvider>
  );

describe("deck page loading state", () => {
  beforeAll(async () => {
    await i18n.init();
    await i18n.changeLanguage("en");
    await i18n.loadNamespaces("translation");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the detail skeleton with status text while the deck loads", async () => {
    vi.spyOn(global, "fetch").mockImplementation(() => new Promise(() => {}));
    renderWithRoute("/deck/venusaur-a1-004", "/deck/:deckId", <DeckDetailPage />);

    const skeleton = screen.getByTestId("deck-page-skeleton");
    expect(await screen.findByRole("status")).toHaveTextContent("Loading deck");
    expect(within(skeleton).getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
  });

  it("lays out the hero, then the card grid, then the matchup panel", () => {
    vi.spyOn(global, "fetch").mockImplementation(() => new Promise(() => {}));
    renderWithRoute("/deck/venusaur-a1-004", "/deck/:deckId", <DeckDetailPage />);

    const hero = screen.getByTestId("deck-skeleton-hero");
    const grid = screen.getByTestId("deck-skeleton-grid");
    const panel = screen.getByTestId("deck-skeleton-panel");
    expect(hero.children).toHaveLength(3);
    expect(within(hero).getByRole("status")).toBeInTheDocument();
    expect(grid.children).toHaveLength(8);
    expect(hero.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(grid.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders the finder skeleton with status text and no matchup panel", async () => {
    vi.spyOn(global, "fetch").mockImplementation(() => new Promise(() => {}));
    renderWithRoute("/deck", "/deck", <DeckFinderPage />);

    expect(await screen.findByRole("status")).toHaveTextContent("Loading deck");
    expect(screen.getByTestId("deck-skeleton-grid").children).toHaveLength(8);
    expect(screen.queryByTestId("deck-skeleton-panel")).not.toBeInTheDocument();
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
  });
});
