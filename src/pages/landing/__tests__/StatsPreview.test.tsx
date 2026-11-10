import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import StatsPreview from "../StatsPreview";

const movement = vi.hoisted(() => ({
  entries: [{ name: "miraidon-ex", delta: 0.02, share: 0.1 }] as Record<string, unknown>[],
}));

const deck = {
  id: "miraidon-ex",
  name: "miraidon-ex",
  iconPrimary: { image: "/card.webp" },
  powerScore: 100,
};

vi.mock("../../../app/use-decks", () => ({
  useDecks: () => ({
    decks: [deck],
    metaShare: { decks: movement.entries },
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
      "/statistics/"
    );
  });

  it("lists only the decks that carry movement", () => {
    movement.entries = [
      { name: "miraidon-ex", sharePrev: 0.08, delta: 0.02, share: 0.1, firstSeen: "2026-01-01", isNew: false },
      { name: "gardevoir-ex", share: 0.2, windowGames: 40 },
    ];
    render(
      <MemoryRouter>
        <StatsPreview />
      </MemoryRouter>
    );

    expect(screen.getByText("+2.0 pp")).toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });
});
