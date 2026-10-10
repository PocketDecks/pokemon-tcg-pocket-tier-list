import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import useFilters from "../../../app/use-filters";
import FilterContextProvider from "../../../components/FilterContext";
import CardsListPage from "../CardsListPage";

const cards = [
  { id: "a1-001", name: "Pikachu", score: 2, popularity: 1 },
  { id: "a2a-001", name: "Triumphant Light card", score: 1, popularity: 1 },
];

const mockUseCards = vi.hoisted(() => vi.fn());

vi.mock("../../../app/use-cards", () => ({
  default: mockUseCards,
}));

mockUseCards.mockImplementation(() => {
  const { expansion } = useFilters();
  return expansion === "a2a" ? [] : cards;
});

vi.mock("../../../app/use-expansions", () => ({
  default: () => [
    {
      id: "a2a",
      name: "Triumphant Light",
      release_date: "2025-02-01",
      packs: [],
    },
  ],
}));

vi.mock("../../../ads/ContentReadyContext", () => ({
  useMarkContentReady: vi.fn(),
}));

vi.mock("../../../components/CardIcon", () => ({
  default: ({ card }: { card: { name: string } }) => <span>{card.name}</span>,
}));

vi.mock("../../../components/LastUpdated", () => ({
  default: () => <span>Updated</span>,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("CardsListPage empty recovery", () => {
  it("keeps the expansion filter available and recovers to All", async () => {
    render(
      <MemoryRouter>
        <FilterContextProvider>
          <CardsListPage />
        </FilterContextProvider>
      </MemoryRouter>
    );

    const filter = screen.getByRole("combobox");
    fireEvent.change(filter, { target: { value: "a2a" } });

    expect(await screen.findByText("No cards found")).toBeInTheDocument();
    const emptyFilter = screen.getByRole("combobox");
    expect(emptyFilter).toHaveValue("a2a");

    fireEvent.change(emptyFilter, { target: { value: "" } });

    await waitFor(() => {
      expect(screen.getByText("Pikachu")).toBeInTheDocument();
    });
    expect(screen.getByRole("combobox")).toHaveValue("");
  });
});
