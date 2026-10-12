import { buildTrends } from "../utils/build-trends";
import { Deck } from "../utils/types";

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

const NOW = new Date("2026-10-12T12:00:00.000Z");

describe("buildTrends", () => {
  it("percentages for a given day sum to <=100 and are 0 for absent decks", () => {
    const qualifiedDecks: Deck[] = [
      makeDeck({ name: "Deck A", date: "2024-01-01T00:00:00.000Z", totalGames: 30 }),
      makeDeck({ name: "Deck B", date: "2024-01-01T00:00:00.000Z", totalGames: 20 }),
    ];
    const trends = buildTrends(qualifiedDecks, ["Deck A", "Deck B"], NOW);

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

    const trends = buildTrends(qualifiedDecks, ["Deck A"], NOW);

    expect(trends[0]["Deck A"]).toBe(0);
    expect(Number.isNaN(trends[0]["Deck A"])).toBe(false);
  });

  it("output is sorted chronologically regardless of input order", () => {
    const qualifiedDecks: Deck[] = [
      makeDeck({ name: "Deck A", date: "2024-05-02T00:00:00.000Z", totalGames: 10 }),
      makeDeck({ name: "Deck A", date: "2024-05-01T00:00:00.000Z", totalGames: 10 }),
    ];

    const trends = buildTrends(qualifiedDecks, ["Deck A"], NOW);

    expect(trends.map((t) => t.date)).toEqual(["2024-05-01", "2024-05-02"]);
  });

  it("excludes the current UTC date", () => {
    const trends = buildTrends(
      [
        makeDeck({ name: "Deck A", date: "2026-10-12T00:00:00.000Z", totalGames: 10 }),
        makeDeck({ name: "Deck A", date: "2024-01-01T00:00:00.000Z", totalGames: 10 }),
      ],
      ["Deck A"],
      NOW
    );

    expect(trends.map((trend) => trend.date)).toEqual(["2024-01-01"]);
  });
});
