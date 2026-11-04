import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import ExpansionListPage from "../ExpansionListPage";
import { FilterContext, SortBy } from "../../../components/FilterContext";

vi.mock("../../../app/use-expansions", () => ({
  __esModule: true,
  default: () => [
    {
      id: "a1",
      name: "Genetic Apex",
      release_date: "2024-10-30",
      packs: [
        { id: "a1-charizard", name: "Charizard", image: "a1-charizard.webp" },
        { id: "a1-mewtwo", name: "Mewtwo", image: "a1-mewtwo.webp" },
      ],
    },
    {
      id: "b4a",
      name: "Team Rocket's Ambition",
      release_date: "2026-08-27",
      packs: [{ id: "b4a-booster", name: "Booster", image: "b4a-booster.webp" }],
    },
  ],
}));

vi.mock("../../../ads/ContentReadyContext", () => ({
  __esModule: true,
  useMarkContentReady: vi.fn(),
}));

const card = (id: string, pack: string) => ({
  id,
  name: id,
  rarity: "Common",
  pack,
  type: "Pokemon",
  supertype: "Pokemon",
  health: 100,
  stage: "Basic",
  image: `/cards/${id}.webp`,
  ex: false,
  deckBuilderNr: 1,
});

const cards = [card("a1-001", "Charizard"), card("a1-002", "Mewtwo"), card("b4a-001", "Booster")];
const scores = [
  { name: "1 a1 001", score: 0.8, popularity: 0.5, count: 1 },
  { name: "1 a1 002", score: 0.6, popularity: 0.5, count: 1 },
  { name: "1 b4a 001", score: 0.9, popularity: 0.5, count: 1 },
];

const filterWithExpansion = (expansion: string | null) => ({
  energy: null,
  setEnergy: () => {},
  includeEx: true,
  setIncludeEx: () => {},
  deckAmount: 30,
  setDeckAmount: () => {},
  sortBy: SortBy.POWER,
  setSortBy: () => {},
  expansion,
  setExpansion: () => {},
  latestExpansionCards: null,
  setLatestExpansionCards: () => {},
});

const renderWithFilter = (path: string, expansion: string | null) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  queryClient.setQueryData(["cards"], { cards });
  queryClient.setQueryData(["card-scores"], scores);
  return render(
    <QueryClientProvider client={queryClient}>
      <FilterContext.Provider value={filterWithExpansion(expansion) as never}>
        <MemoryRouter initialEntries={[path]}>
          <ExpansionListPage />
        </MemoryRouter>
      </FilterContext.Provider>
    </QueryClientProvider>
  );
};

describe("ExpansionListPage with a set chosen on the cards list", () => {
  it("still ranks every expansion", () => {
    renderWithFilter("/expansion-list/", "a1");

    expect(screen.getByRole("link", { name: "Genetic Apex" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Team Rocket's Ambition" })).toBeInTheDocument();
  });

  it("still ranks every pack", () => {
    renderWithFilter("/expansion-list/?view=packs", "a1");

    expect(screen.getByRole("link", { name: "Genetic Apex: Charizard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Genetic Apex: Mewtwo" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Team Rocket's Ambition: Booster" })).toBeInTheDocument();
  });
});
