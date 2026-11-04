import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import ExpansionListPage from "../ExpansionListPage";

const state = vi.hoisted(() => ({
  cards: [] as unknown[],
  expansions: [] as unknown[],
}));

const setFixture = (id: string, name: string, image: string) => {
  state.cards = [{ id: `${id}-001`, name: "Volbeat", set: id, pack: name, score: 0.8 }];
  state.expansions = [
    {
      id,
      name,
      packs: [{ id: `${id}-booster`, name: "Booster", image }],
    },
  ];
};

vi.mock("../../../app/use-cards", () => ({
  __esModule: true,
  default: () => state.cards,
}));

vi.mock("../../../app/use-expansions", () => ({
  __esModule: true,
  default: () => state.expansions,
}));

vi.mock("../../../ads/ContentReadyContext", () => ({
  __esModule: true,
  useMarkContentReady: vi.fn(),
}));

describe("ExpansionListPage", () => {
  beforeEach(() => {
    setFixture("b4a", "Team Rocket's Ambition", "b4a.webp");
  });

  it("renders pack tiers without deck data", () => {
    render(
      <MemoryRouter>
        <ExpansionListPage />
      </MemoryRouter>
    );

    expect(screen.getByText("S")).toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAttribute("src", "b4a.webp");
  });

  it("links a listed expansion icon to its page", () => {
    setFixture("c1", "Dual Fusion", "c1.webp");
    const { container } = render(
      <MemoryRouter>
        <ExpansionListPage />
      </MemoryRouter>
    );
    expect(container.querySelector('a[href="/expansion-list/c1"]')).not.toBeNull();
  });

  it("renders a deluxe expansion icon without a link", () => {
    setFixture("b4b", "Deluxe Pack: Mega", "b4b.webp");
    const { container } = render(
      <MemoryRouter>
        <ExpansionListPage />
      </MemoryRouter>
    );
    expect(screen.getByRole("img")).toHaveAttribute("src", "b4b.webp");
    expect(container.querySelectorAll('a[href^="/expansion-list/"]')).toHaveLength(0);
  });
});
