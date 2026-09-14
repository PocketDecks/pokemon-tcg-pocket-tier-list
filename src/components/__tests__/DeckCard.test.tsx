import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
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
  matchups: [],
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

describe("DeckCard", () => {
  it("uses the neutral share style and no trend arrow inside the dead-band", () => {
    render(
      <MemoryRouter>
        <DeckCard deck={deck} metaShare={metaShare} />
      </MemoryRouter>
    );

    const share = screen.getByText("10.0%");
    expect(share).toHaveStyle({ color: "rgba(255, 255, 255, 0.85)" });
    expect(share).not.toHaveTextContent("▲");
    expect(share).not.toHaveTextContent("▼");
  });
});