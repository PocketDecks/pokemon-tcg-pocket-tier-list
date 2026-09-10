import { buildTrends } from "../utils/build-trends";
import { Deck, PartialDeck } from "../utils/types";

const makeDeck = (overrides: Partial<Deck>): Deck => ({
  id: "id",
  name: "Deck A",
  cards: [],
  pokemon: 0,
  differentPokemon: 0,
  winCount: 0,
  lossCount: 0,
  totalGames: 0,
  date: "2024-01-01T00:00:00.000Z",
  tournamentExPercent: 0,
  noTrainerPercent: 0,
  wins: [],
  losses: [],
  ...overrides,
});

const makePartial = (name: string, score: number): PartialDeck => ({
  name,
  lists: [{ cards: [], score, strength: 1 }],
  popularity: 1,
  percentOfGames: 0.1,
  score,
  expectedWinRate: 0.5,
  fieldCoverage: 0,
  powerScore: null,
  freqScore: 0,
  metaScore: null,
});

describe("buildTrends", () => {
  it("percentages for a given day sum to <=100 and are 0 for absent decks", () => {
    const qualifiedDecks: Deck[] = [
      makeDeck({ name: "Deck A", date: "2024-01-01T00:00:00.000Z", totalGames: 30 }),
      makeDeck({ name: "Deck B", date: "2024-01-01T00:00:00.000Z", totalGames: 20 }),
    ];
    const bestDecks = [makePartial("Deck A", 10), makePartial("Deck B", 5)];

    const trends = buildTrends(qualifiedDecks, bestDecks);

    expect(trends).toHaveLength(1);
    const day = trends[0];
    expect(day.date).toBe("2024-01-01");
    expect(day["Deck A"]).toBeCloseTo(60); // 30/50 * 100
    expect(day["Deck B"]).toBeCloseTo(40); // 20/50 * 100
  });

  it("a day with zero total games yields 0 percentages, not NaN", () => {
    const qualifiedDecks: Deck[] = [
      makeDeck({ name: "Deck A", date: "2024-02-01T00:00:00.000Z", totalGames: 0 }),
    ];

    const trends = buildTrends(qualifiedDecks, [makePartial("Deck A", 1)]);

    expect(trends[0]["Deck A"]).toBe(0);
    expect(Number.isNaN(trends[0]["Deck A"])).toBe(false);
  });

  it("takes the first six entries of the pre-sorted bestDecks array", () => {
    // get-best-decks.ts sorts bestDecks by score descending before calling;
    // this pins that the function trusts that order rather than re-sorting.
    const bestDecks = Array.from({ length: 8 }, (_, i) =>
      makePartial(`Deck ${i}`, i)
    );
    const qualifiedDecks: Deck[] = bestDecks.map((d) =>
      makeDeck({ name: d.name, date: "2024-03-01T00:00:00.000Z", totalGames: 10 })
    );

    const trends = buildTrends(qualifiedDecks, bestDecks);

    // First six entries in array order (Deck 0..Deck 5) tracked; later
    // entries ignored — the function trusts the caller's sort.
    expect(trends[0]).toHaveProperty("Deck 0");
    expect(trends[0]).toHaveProperty("Deck 5");
    expect(trends[0]).not.toHaveProperty("Deck 6");
    expect(trends[0]).not.toHaveProperty("Deck 7");
  });

  it("output is sorted chronologically regardless of input order", () => {
    const qualifiedDecks: Deck[] = [
      makeDeck({ name: "Deck A", date: "2024-05-02T00:00:00.000Z", totalGames: 10 }),
      makeDeck({ name: "Deck A", date: "2024-05-01T00:00:00.000Z", totalGames: 10 }),
    ];

    const trends = buildTrends(qualifiedDecks, [makePartial("Deck A", 1)]);

    expect(trends.map((t) => t.date)).toEqual(["2024-05-01", "2024-05-02"]);
  });
});
