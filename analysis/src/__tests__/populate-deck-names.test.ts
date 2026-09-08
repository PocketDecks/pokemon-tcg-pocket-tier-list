import { populateDeckNames } from "../utils/populate-deck-names";
import { Deck } from "../utils/types";
import { UNNAMED_DECK } from "../utils/get-deck-name";

jest.mock("../utils/get-deck-name", () => ({
  __esModule: true,
  default: jest.fn(),
  UNNAMED_DECK: "professor's-research-pa-007",
}));

import getDeckName from "../utils/get-deck-name";

const mockDeck: Deck = {
  id: "test-id",
  cards: [],
  pokemon: 0,
  differentPokemon: 0,
  winCount: 0,
  lossCount: 0,
  totalGames: 0,
  date: new Date().toISOString(),
  tournamentExPercent: 0,
  noTrainerPercent: 0,
  wins: [],
  losses: [],
  name: "Test Deck",
};

describe("populateDeckNames", () => {
  beforeEach(() => {
    (getDeckName as jest.Mock).mockReset();
  });

  it("should populate deck names and create idToName mapping", () => {
    (getDeckName as jest.Mock).mockImplementation(
      (deck: Deck) => (deck.id === "valid-id" ? "Test Deck Name" : UNNAMED_DECK)
    );
    const validDeck: Deck = {
      ...mockDeck,
      id: "valid-id",
    };
    const unnamedDeck: Deck = {
      ...mockDeck,
      id: "unnamed-id",
    };
    const decks = [validDeck, unnamedDeck];

    const { decks: resultDecks, idToName } = populateDeckNames(decks);

    expect(resultDecks).toHaveLength(2);
    expect(resultDecks[0].name).toBe("Test Deck Name");
    expect(idToName).toEqual({
      "valid-id": "Test Deck Name",
      "unnamed-id": UNNAMED_DECK,
    });
  });

  it("keeps decks whose name resolves to the unnamed sentinel", () => {
    (getDeckName as jest.Mock).mockImplementation(() => UNNAMED_DECK);
    const unnamedDeck1: Deck = {
      ...mockDeck,
      id: "unnamed-id-1",
    };
    const unnamedDeck2: Deck = {
      ...mockDeck,
      id: "unnamed-id-2",
    };
    const decks = [unnamedDeck1, unnamedDeck2];

    const { decks: resultDecks, idToName } = populateDeckNames(decks);

    expect(resultDecks).toHaveLength(2);
    expect(idToName).toEqual({
      "unnamed-id-1": UNNAMED_DECK,
      "unnamed-id-2": UNNAMED_DECK,
    });
  });

  it("keeps a deck that matches no pairing, filed under UNNAMED_DECK", () => {
    // getDeckName never returns null; the unnamed bucket is a real name. A
    // truthiness guard here would silently drop these decks if the sentinel
    // ever became falsy.
    (getDeckName as jest.Mock).mockImplementation(
      (deck: Deck) => (deck.id === "valid-id" ? "Test Deck Name" : UNNAMED_DECK)
    );
    const deck = { ...mockDeck, id: "unmatched-id" };
    const { decks, idToName } = populateDeckNames([deck]);
    expect(decks).toHaveLength(1);
    expect(idToName[deck.id]).toBe(UNNAMED_DECK);
  });
});
