import { buildWindowArtefacts } from "../utils/build-window-artefacts";
import { Card, Deck } from "../utils/types";

const TODAY = new Date("2026-09-24T12:00:00.000Z");

const card = (number: string): Card => ({ name: `Card ${number}`, count: 2, set: "A1", number });

const makeDeck = (overrides: Partial<Deck>): Deck => ({
  id: "deck",
  name: "Alpha",
  cards: [card("1")],
  pokemon: 2,
  differentPokemon: 1,
  winCount: 18,
  lossCount: 12,
  totalGames: 30,
  date: "2026-09-23T02:00:00.000Z",
  tournamentExPercent: 0.5,
  noTrainerPercent: 0,
  wins: [],
  losses: [],
  ...overrides,
});

const rankedNames = (decks: Deck[]): string[] =>
  buildWindowArtefacts(decks, "all", TODAY).bestDecks.map((deck) => deck.name);

describe("the win-rate gate", () => {
  it("keeps a deck exactly at the gate and drops one just below it", () => {
    const atGate = makeDeck({ id: "at", name: "At", winCount: 18, totalGames: 30 });
    const below = makeDeck({ id: "below", name: "Below", winCount: 17, totalGames: 30 });
    expect(rankedNames([atGate, below])).toEqual(["At"]);
  });

  it("drops a deck that played no games instead of dividing by zero", () => {
    expect(rankedNames([makeDeck({ winCount: 0, totalGames: 0 })])).toEqual([]);
  });
});

describe("the archetype games floor", () => {
  it("keeps an archetype at the floor and drops one just under it", () => {
    const enough = makeDeck({ id: "enough", name: "Enough", totalGames: 25, winCount: 20 });
    const tooFew = makeDeck({ id: "few", name: "TooFew", cards: [card("2")], totalGames: 24, winCount: 20 });
    expect(rankedNames([enough, tooFew])).toEqual(["Enough"]);
  });

  it("sums the games of an archetype's decks before comparing", () => {
    const first = makeDeck({ id: "one", name: "Split", cards: [card("3")], totalGames: 13, winCount: 10 });
    const second = makeDeck({ id: "two", name: "Split", cards: [card("4")], totalGames: 12, winCount: 10 });
    expect(rankedNames([first, second])).toEqual(["Split"]);
  });

  it("counts only qualified games toward the floor", () => {
    const qualified = makeDeck({ id: "q", name: "Mixed", totalGames: 20, winCount: 15 });
    const unqualified = makeDeck({ id: "u", name: "Mixed", cards: [card("5")], totalGames: 30, winCount: 3 });
    expect(rankedNames([qualified, unqualified])).toEqual([]);
  });
});
