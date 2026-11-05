import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import FilterContextProvider from "../../../components/FilterContext";
import { useMarkContentReady } from "../../../ads/ContentReadyContext";
import CardsListPage from "../CardsListPage";

const retry = vi.fn();

vi.mock("../../../app/use-cards", () => ({
  default: () => ({
    cards: null,
    error: new Error("Card score request failed with status 503"),
    retry,
  }),
}));

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

describe("CardsListPage score recovery", () => {
  it("shows an error and retry while keeping the filter available", () => {
    render(
      <MemoryRouter>
        <FilterContextProvider>
          <CardsListPage />
        </FilterContextProvider>
      </MemoryRouter>
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("loadError.title")).toBeInTheDocument();
    expect(screen.queryByText("No cards found")).not.toBeInTheDocument();
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByRole("alert").parentElement).toHaveStyle({ position: "relative", display: "flex" });

    fireEvent.click(screen.getByRole("button", { name: "loadError.retry" }));

    expect(retry).toHaveBeenCalledTimes(1);
    expect(vi.mocked(useMarkContentReady).mock.calls.at(-1)).toEqual([false, true]);
  });
});
