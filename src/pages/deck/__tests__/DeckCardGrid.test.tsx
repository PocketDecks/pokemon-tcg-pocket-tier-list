import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CardType } from "../../../app/cards-api";
import { declaredStyle } from "../../../test-utils/declared-style";
import DeckCardGrid from "../DeckCardGrid";

const card = (id: string, name: string): CardType => ({
  id,
  name,
  rarity: "Common",
  pack: "A1",
  type: "Basic",
  supertype: "Pokemon",
  health: 70,
  stage: "Basic",
  image: `https://raw.githubusercontent.com/example/cards/${id}.webp`,
  ex: false,
  set: "A1",
  deckBuilderNr: 1,
});

const cards = [card("b1-184", "Altaria"), card("b3a-020", "Espeon")];

describe("DeckCardGrid", () => {
  it("serves the first-party card thumbnails with explicit dimensions and sizes", () => {
    render(<DeckCardGrid cards={cards} counts={new Map([["b1-184", 2]])} />);

    const image = screen.getByAltText("Altaria");
    expect(image).toHaveAttribute("src", "/thumbs/v3/cards/b1-184-240.webp?v=3");
    expect(image).toHaveAttribute(
      "srcset",
      "/thumbs/v3/cards/b1-184-120.webp?v=3 120w, /thumbs/v3/cards/b1-184-240.webp?v=3 240w"
    );
    expect(image).toHaveAttribute("sizes", "(max-width: 900px) calc(50vw - 36px), 240px");
    expect(image).toHaveAttribute("width", "240");
    expect(image).toHaveAttribute("height", "335");
    expect(declaredStyle(image, "height")).toBe("auto");
  });

  it("loads the first card eagerly with high fetch priority and lazy-loads the rest", () => {
    render(<DeckCardGrid cards={cards} counts={new Map()} />);

    const first = screen.getByAltText("Altaria");
    const second = screen.getByAltText("Espeon");
    expect(first).toHaveAttribute("fetchpriority", "high");
    expect(first).not.toHaveAttribute("loading");
    expect(second).toHaveAttribute("loading", "lazy");
    expect(second).not.toHaveAttribute("fetchpriority");
  });

  it("falls back to the upstream image and drops the srcset once, when a thumbnail fails", () => {
    render(<DeckCardGrid cards={cards} counts={new Map()} />);

    const image = screen.getByAltText("Espeon");
    fireEvent.error(image);

    expect(image).not.toHaveAttribute("srcset");
    expect(image).not.toHaveAttribute("sizes");
    expect(image).toHaveAttribute("src", cards[1].image);

    fireEvent.error(image);
    expect(image).toHaveAttribute("src", cards[1].image);
  });
});
