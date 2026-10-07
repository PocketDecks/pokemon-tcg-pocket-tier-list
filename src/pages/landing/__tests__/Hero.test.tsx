import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import Hero from "../Hero";

const state = vi.hoisted(() => ({
  decks: null as unknown[] | null,
  tiers: [] as unknown[],
}));

vi.mock("../../../app/use-decks", () => ({
  useDecks: () => ({ decks: state.decks, metaShareBySlug: null }),
}));

vi.mock("../../../app/use-deck-tiers", () => ({
  default: () => state.tiers,
}));

vi.mock("../../../components/DeckCard", () => ({
  default: () => <div data-testid="deck-card" />,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("Hero", () => {
  it("uses the tier-list image when deck data resolves without ranked tiers", () => {
    state.decks = [];
    state.tiers = [];

    render(
      <MemoryRouter>
        <Hero />
      </MemoryRouter>
    );

    expect(screen.getByRole("img", { name: "header.tierList" })).toHaveAttribute(
      "src",
      "/assets/hero/tier-list.webp"
    );
    expect(screen.queryByText("S")).not.toBeInTheDocument();
  });

  it("keeps skeleton rows while deck data is unresolved", () => {
    state.decks = null;
    state.tiers = [];

    render(
      <MemoryRouter>
        <Hero />
      </MemoryRouter>
    );

    expect(screen.queryByRole("img", { name: "header.tierList" })).not.toBeInTheDocument();
    expect(screen.getByText("S")).toBeInTheDocument();
  });
});
