import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import CardsListPage from "../CardsListPage";

vi.mock("../../../app/use-cards", () => ({
  __esModule: true,
  default: () => [
    {
      id: "a1-001",
      name: "Bulbasaur",
      score: 10,
      image: null,
    },
  ],
}));

vi.mock("../../../app/use-filters", () => ({
  __esModule: true,
  default: () => ({
    expansion: null,
    setExpansion: vi.fn(),
  }),
}));

vi.mock("../../../app/use-expansions", () => ({
  __esModule: true,
  default: () => [{ id: "a1", name: "Genetic Apex" }],
}));

vi.mock("../../../ads/ContentReadyContext", () => ({
  __esModule: true,
  useMarkContentReady: vi.fn(),
}));

vi.mock("../../../components/UserAccount", () => ({
  __esModule: true,
  default: () => null,
}));

describe("CardsListPage", () => {
  it("renders the filter controls inside one absolute-positioned ancestor", () => {
    render(
      <MemoryRouter>
        <CardsListPage />
      </MemoryRouter>
    );

    const combobox = screen.getByRole("combobox");
    let absoluteAncestorCount = 0;
    let element = Reflect.get(combobox, "parentElement") as HTMLElement | null;

    while (element) {
      if (getComputedStyle(element).position === "absolute") {
        absoluteAncestorCount += 1;
      }
      element = Reflect.get(element, "parentElement") as HTMLElement | null;
    }

    expect(absoluteAncestorCount).toBe(1);
  });
});
