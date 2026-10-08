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

  it("serves the preview cards from the first-party thumbnails", () => {
    const { container } = render(
      <MemoryRouter>
        <BestDeckFinder />
      </MemoryRouter>
    );

    const image = container.querySelector("img");
    expect(image).toHaveAttribute("src", "/thumbs/v3/cards/card-1-240.webp?v=3");
    expect(image).toHaveAttribute(
      "srcset",
      "/thumbs/v3/cards/card-1-120.webp?v=3 120w, /thumbs/v3/cards/card-1-240.webp?v=3 240w"
    );
    expect(image).toHaveAttribute("width", "240");
    expect(image).toHaveAttribute("height", "335");
  });
});
