import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import ExpansionPage from "../ExpansionPage";

const state = vi.hoisted(() => ({
  expansions: null as unknown[] | null,
}));

vi.mock("../../../app/use-expansions", () => ({
  __esModule: true,
  default: () => state.expansions,
}));

vi.mock("../../../app/use-decks", () => ({
  useDecks: () => ({
    decks: [],
    rawDecks: [],
    metaShareBySlug: null,
    loading: false,
    error: null,
  }),
}));

vi.mock("../../../ads/ContentReadyContext", () => ({
  __esModule: true,
  useMarkContentReady: vi.fn(),
}));

const renderAt = (path: string) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  queryClient.setQueryData(["cards"], { cards: [] });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/expansion-list/:expansionId" element={<ExpansionPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe("ExpansionPage while expansions load", () => {
  it("shows no not-found text while the expansion list is still loading", () => {
    state.expansions = null;
    renderAt("/expansion-list/c1");

    expect(screen.queryByText("notFound.title")).toBeNull();
  });

  it("shows not-found once the list has loaded and the id is unknown", () => {
    state.expansions = [{ id: "c1", name: "Dual Fusion", release_date: null, packs: [] }];
    renderAt("/expansion-list/zzz");

    expect(screen.getByText("notFound.title")).toBeInTheDocument();
  });
});
