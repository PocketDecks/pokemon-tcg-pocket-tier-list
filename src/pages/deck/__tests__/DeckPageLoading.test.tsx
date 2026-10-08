import type { ReactElement } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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

  it("renders the deck skeleton with status text while the detail deck loads", async () => {
    vi.spyOn(global, "fetch").mockImplementation(() => new Promise(() => {}));
    renderWithRoute("/deck/venusaur-a1-004", "/deck/:deckId", <DeckDetailPage />);

    expect(await screen.findByRole("status")).toHaveTextContent("Loading deck");
    expect(screen.getByTestId("deck-page-skeleton")).toBeInTheDocument();
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
  });

  it("reserves at least the first viewport so the footer sits below it", () => {
    vi.spyOn(global, "fetch").mockImplementation(() => new Promise(() => {}));
    renderWithRoute("/deck/venusaur-a1-004", "/deck/:deckId", <DeckDetailPage />);

    const skeleton = screen.getByTestId("deck-page-skeleton");
    expect(getComputedStyle(skeleton).minHeight).toBe("100dvh");
  });

  it("renders the finder skeleton with status text while the decks load", async () => {
    vi.spyOn(global, "fetch").mockImplementation(() => new Promise(() => {}));
    renderWithRoute("/deck", "/deck", <DeckFinderPage />);

    expect(await screen.findByRole("status")).toHaveTextContent("Loading deck");
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
  });
});
