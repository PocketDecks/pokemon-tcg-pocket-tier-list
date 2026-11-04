import { describe, expect, it } from "vitest";
import { expansionPageData } from "../expansion-page-data";

const card = (id: string, name: string, set = "c1") => ({
  id,
  name,
  rarity: "Common",
  pack: "Test",
  type: "Pokemon",
  supertype: "Pokemon",
  health: 100,
  stage: "Basic",
  image: `/cards/${id}.png`,
  ex: false,
  set,
  deckBuilderNr: 1,
});

const deck = (name: string, cards: ReturnType<typeof card>[]) => ({
  id: name,
  name,
  lists: [],
  bestList: { cards, score: 1, strength: 1, energyIds: [], deckCode: null },
  score: 1,
  popularity: 1,
  strength: 1,
  expectedWinRate: 0.5,
  fieldCoverage: 1,
  powerScore: 50,
  freqScore: 50,
  metaScore: 50,
  percentOfGames: 1,
  iconPrimary: cards[0],
  iconSecondary: null,
});

describe("expansion page data", () => {
  it("keeps used cards and decks, orders cards by set number and decks by display name", () => {
    const cards = [card("c1-010", "Tenth"), card("c1-002", "Second"), card("c1-001", "First")];
    const decks = [deck("zeta", [cards[0], cards[1]]), deck("alpha", [cards[2]])];
    const result = expansionPageData(
      { id: "c1", name: "Dual Fusion", release_date: "2026-10-29", packs: [] },
      cards,
      decks,
      (value) => value.name
    );
    expect(result.cards.map((value) => value.id)).toEqual(["c1-001", "c1-002", "c1-010"]);
    expect(result.decks.map((value) => value.displayName)).toEqual(["alpha", "zeta"]);
  });
});
