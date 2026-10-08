import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import DeckCard from "../DeckCard";
import type { FullDeckType } from "../../contexts/DecksContext";
import type { MetaShareEntry } from "../../types/pipeline-data";

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

const deck: FullDeckType = {
  id: "deck-1",
  name: "Test Deck",
  lists: [{ cards: [card], score: 1, strength: 1, energyIds: [], deckCode: null }],
  bestList: { cards: [card], score: 1, strength: 1, energyIds: [], deckCode: null },
  score: 1,
  popularity: 1,
  strength: 1,
  expectedWinRate: 0.5,
  fieldCoverage: 0.5,
  powerScore: null,
  freqScore: 1,
  metaScore: null,
  percentOfGames: 0.5,

  iconPrimary: card,
  iconSecondary: null,
};

const metaShare: MetaShareEntry = {
  name: "Test Deck",
  share: 0.1,
  sharePrev: 0.0998517989051555,
  delta: 0.0001482010948445009,
  games14: 100,
  firstSeen: "2026-01-01",
  isNew: false,
};

const remoteImage =
  "https://raw.githubusercontent.com/chase-manning/pokemon-tcg-pocket-cards/refs/heads/main/images/webp/cards/b3/081.webp";

describe("DeckCard", () => {
  it("uses the neutral share style and no trend arrow inside the dead-band", () => {
    render(
      <MemoryRouter>
        <DeckCard deck={deck} metaShare={metaShare} />
      </MemoryRouter>
    );

    const share = screen.getByText("10.0%");
    expect(share).toHaveStyle({ color: "var(--text)" });
    expect(share).not.toHaveTextContent("▲");
    expect(share).not.toHaveTextContent("▼");
  });

  const pairDeck: FullDeckType = {
    ...deck,
    iconPrimary: { ...card, id: "card-2", name: "Mega Blaziken ex" },
    iconSecondary: { ...card, id: "card-3", name: "Greninja" },
  };

  it("names the deck and its share for assistive technology", () => {
    render(
      <MemoryRouter>
        <DeckCard deck={pairDeck} metaShare={metaShare} metaShareLabel="Meta share" />
      </MemoryRouter>
    );

    expect(
      screen.getByRole("link", { name: "Mega Blaziken ex / Greninja, Meta share 10.0%" })
    ).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("clears responsive sources on primary and secondary fallback", () => {
    const remoteDeck: FullDeckType = {
      ...pairDeck,
      iconPrimary: { ...pairDeck.iconPrimary, name: "Primary", image: remoteImage },
      iconSecondary: { ...pairDeck.iconSecondary!, name: "Secondary", image: remoteImage },
    };
    render(
      <MemoryRouter>
        <DeckCard deck={remoteDeck} />
      </MemoryRouter>
    );

    const images = [screen.getByAltText("Primary"), screen.getByAltText("Secondary")];
    images.forEach((image) => {
      expect(image).toHaveAttribute("srcset");
      expect(image).toHaveAttribute("sizes");
      fireEvent.error(image);
      expect(image).toHaveAttribute("src", remoteImage);
      expect(image).not.toHaveAttribute("srcset");
      expect(image).not.toHaveAttribute("sizes");
    });
  });

  it("uses the observed desktop thumbnail size hint", () => {
    render(
      <MemoryRouter>
        <DeckCard deck={pairDeck} />
      </MemoryRouter>
    );

    expect(screen.getByAltText("Mega Blaziken ex")).toHaveAttribute(
      "sizes",
      "(max-width: 900px) 25vw, 8vw"
    );
    expect(screen.getByAltText("Greninja")).toHaveAttribute(
      "sizes",
      "(max-width: 900px) 25vw, 8vw"
    );
  });

  it("shows the full deck name while the tile is hovered", () => {
    render(
      <MemoryRouter>
        <DeckCard deck={pairDeck} />
      </MemoryRouter>
    );
    const link = screen.getByRole("link", { name: "Mega Blaziken ex / Greninja" });

    expect(screen.queryByText("Mega Blaziken ex / Greninja")).not.toBeInTheDocument();
    fireEvent.mouseEnter(link);
    expect(screen.getByText("Mega Blaziken ex / Greninja")).toBeInTheDocument();
    fireEvent.mouseLeave(link);
    expect(screen.queryByText("Mega Blaziken ex / Greninja")).not.toBeInTheDocument();
  });
});

const rect = (values: Partial<DOMRect>): DOMRect =>
  ({
    top: 0,
    left: 0,
    width: 0,
    height: 0,
    bottom: 0,
    right: 0,
    x: 0,
    y: 0,
    toJSON: () => values,
    ...values,
  }) as DOMRect;

describe("DeckCard name label geometry", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const stubRects = (tileTop: number, bubbleHeight: number) => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      if (this.getAttribute("aria-hidden") === "true" && this.textContent) {
        return rect({ width: 240, height: bubbleHeight });
      }
      return rect({ top: tileTop, left: 100, width: 200, height: 200, bottom: tileTop + 200 });
    });
  };

  const hover = () => {
    render(
      <MemoryRouter>
        <DeckCard deck={deck} />
      </MemoryRouter>
    );
    const link = screen.getByRole("link", { name: "Card One" });
    fireEvent.mouseEnter(link);
    return link;
  };

  it("places the label above the tile and clamps it near the viewport top", () => {
    stubRects(15, 40);
    const link = hover();

    const nearTop = screen.getByText("Card One");
    expect(nearTop).toHaveStyle({ top: "12px" });

    fireEvent.mouseLeave(link);
    stubRects(500, 40);
    fireEvent.mouseEnter(link);

    const farDown = screen.getByText("Card One");
    expect(farDown).toHaveStyle({ top: "452px" });
  });

  it("keeps the label above the tile regardless of label height", () => {
    stubRects(15, 60);
    hover();

    expect(screen.getByText("Card One")).toHaveStyle({ top: "12px" });
  });

  it("hides the label when the page scrolls", () => {
    stubRects(15, 40);
    hover();

    expect(screen.getByText("Card One")).toBeInTheDocument();
    fireEvent.scroll(document);
    expect(screen.queryByText("Card One")).not.toBeInTheDocument();
  });
});