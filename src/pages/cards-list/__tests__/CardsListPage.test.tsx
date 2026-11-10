import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeAll, describe, expect, it, vi } from "vitest";
import CardsListPage from "../CardsListPage";
import i18n from "../../../i18n";

vi.mock("../../../app/use-cards", () => ({
  __esModule: true,
  default: () => ({
    cards: [
      {
        id: "a1-001",
        name: "Bulbasaur",
        score: 10,
        image: null,
      },
    ],
    error: null,
    retry: vi.fn(),
  }),
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
  beforeAll(async () => {
    await i18n.init();
    await i18n.loadNamespaces("translation");
    await i18n.changeLanguage("en");
  });

  it("names the game and card tier list in the H1", () => {
    render(
      <MemoryRouter>
        <CardsListPage />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { level: 1, name: "Pokémon TCG Pocket Best Cards and Card Tier List" })).toBeInTheDocument();
  });

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
