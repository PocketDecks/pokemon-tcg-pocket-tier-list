import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import BestDeckFinder from "../BestDeckFinder";

const deck = {
  id: "miraidon-ex",
  name: "miraidon-ex",
  lists: [],
  bestList: {
    cards: [
      { id: "card-1", image: "/card.webp" },
    ],
  },
  powerScore: 100,
};

vi.mock("../../../app/use-decks", () => ({
  useDecks: () => ({ decks: [deck] }),
}));

vi.mock("../../../app/score-baseline", () => ({
  sortByPowerScore: (decks: unknown[]) => decks,
}));

vi.mock("../../../app/deck-display", () => ({
  deckDisplayName: () => "Miraidon ex",
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("BestDeckFinder", () => {
  it("uses the preview deck name as the link name", () => {
    render(
      <MemoryRouter>
        <BestDeckFinder />
      </MemoryRouter>
    );

    expect(screen.getByRole("link", { name: "Miraidon ex" })).toHaveAttribute(
      "href",
      "/deck"
    );
  });
});
