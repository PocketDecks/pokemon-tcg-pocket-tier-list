import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import DeckCard from "../DeckCard";
import type { FullDeckType } from "../../contexts/DecksContext";

const selected = vi.hoisted(() => ({ window: "20d" as "10d" | "20d" | "30d" | "all" }));

vi.mock("../../app/use-meta-window", () => ({
  useMetaWindow: () => ({ window: selected.window, setWindow: () => {} }),
}));

const card = {
  id: "card-1",
  name: "Card One",
  rarity: "Common",
  pack: "Pack",
  type: "Basic",
  supertype: "Pokemon",
  health: 100,
  stage: "Basic",
  image: "/card.png",
  ex: false,
  set: "A1",
  deckBuilderNr: 1,
};

const deck = {
  id: "deck-1",
  name: "Test Deck",
  lists: [],
  bestList: { cards: [card], score: 1, strength: 1, energyIds: [], deckCode: null },
  iconPrimary: card,
  iconSecondary: { ...card, id: "card-2", name: "Card Two" },
} as unknown as FullDeckType;

const renderCard = (window: typeof selected.window, path = "/tier-list", linkTo?: string) => {
  selected.window = window;
  return render(
    <MemoryRouter initialEntries={[path]}>
      <DeckCard deck={deck} linkTo={linkTo} />
    </MemoryRouter>
  );
};

const hrefs = () => screen.getAllByRole("link", { hidden: true }).map((link) => link.getAttribute("href"));

describe("DeckCard window link", () => {
  it("links to the plain deck page in the default window", () => {
    renderCard("20d");

    expect(hrefs()).toEqual(["/deck/deck-1", "/deck/deck-1"]);
  });

  it("carries a non-default window on both the tile and the secondary icon", () => {
    renderCard("30d");

    expect(hrefs()).toEqual(["/deck/deck-1?window=30d", "/deck/deck-1?window=30d"]);
  });

  it("carries the free 10-day window too", () => {
    renderCard("10d");

    expect(hrefs()).toEqual(["/deck/deck-1?window=10d", "/deck/deck-1?window=10d"]);
  });

  it("keeps the locale prefix ahead of the path", () => {
    renderCard("all", "/ja/tier-list");

    expect(hrefs()).toEqual(["/ja/deck/deck-1?window=all", "/ja/deck/deck-1?window=all"]);
  });

  it("leaves an explicit link target untouched", () => {
    renderCard("30d", "/tier-list", "/deck/some-hub");

    expect(hrefs()).toEqual(["/deck/some-hub", "/deck/some-hub"]);
  });
});
