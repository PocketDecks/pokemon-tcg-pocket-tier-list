import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import StatsPreview from "../StatsPreview";

const deck = {
  id: "miraidon-ex",
  name: "miraidon-ex",
  iconPrimary: { image: "/card.webp" },
  powerScore: 100,
};

vi.mock("../../../app/use-decks", () => ({
  useDecks: () => ({
    decks: [deck],
    metaShare: { decks: [{ name: "miraidon-ex", delta: 0.02, share: 0.1 }] },
  }),
}));

vi.mock("../../../app/deck-display", () => ({
  deckDisplayName: () => "Miraidon ex",
  formatArchetypeId: () => "Miraidon ex",
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      key === "statistics.rising" ? "Rising" : "Open statistics",
  }),
}));

describe("StatsPreview", () => {
  it("names the rising panel link with its visible text", () => {
    render(
      <MemoryRouter>
        <StatsPreview />
      </MemoryRouter>
    );

    expect(screen.getByRole("link", { name: /Rising Miraidon ex/i })).toHaveAttribute(
      "href",
      "/statistics"
    );
  });
});
