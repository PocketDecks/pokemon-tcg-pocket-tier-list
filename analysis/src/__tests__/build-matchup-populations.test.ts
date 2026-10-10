import { buildMatchupPopulations } from "../utils/build-matchup-populations";
import { Deck } from "../utils/types";

const deck = (overrides: Partial<Deck>): Deck => ({
  id: "id",
  name: "Alpha",
  cards: [],
  pokemon: 0,
  differentPokemon: 0,
  winCount: 0,
  lossCount: 0,
  totalGames: 0,
  date: "2026-10-01",
  tournamentExPercent: 0,
  noTrainerPercent: 0,
  wins: [],
  losses: [],
  ...overrides,
});

// Two Alpha decks face Beta: one qualified (3-0), one not (0-2). The public
// population counts both; the Power Score population must count only the
// qualified deck, matching the qualified field shares it is weighted against.
const strongAlpha = deck({
  id: "alpha-strong",
  winCount: 3,
  totalGames: 3,
  wins: ["Beta", "Beta", "Beta"],
});
const weakAlpha = deck({
  id: "alpha-weak",
  winCount: 0,
  lossCount: 2,
  totalGames: 2,
  losses: ["Beta", "Beta"],
});
const allDecks = [strongAlpha, weakAlpha];
const qualifiedDecks = [strongAlpha];

describe("buildMatchupPopulations", () => {
  it("keeps the public matchup artefact on the all-player population", () => {
    const { publicMatchupData } = buildMatchupPopulations(allDecks, qualifiedDecks, [
      "Alpha",
    ]);

    const total = publicMatchupData["Alpha"].find((r) => r.name === "Total")!;
    expect(total.totalGames).toBe(5);

    const beta = publicMatchupData["Alpha"].find((r) => r.name === "Beta")!;
    expect(beta.winRate).toBeCloseTo(0.6, 10);
  });

  it("builds the Power Score matchup population from qualified decks only", () => {
    const { powerMatchupData } = buildMatchupPopulations(allDecks, qualifiedDecks, [
      "Alpha",
    ]);

    const total = powerMatchupData["Alpha"].find((r) => r.name === "Total")!;
    expect(total.totalGames).toBe(3);

    const beta = powerMatchupData["Alpha"].find((r) => r.name === "Beta")!;
    expect(beta.winRate).toBeCloseTo(1, 10);
  });

  it("diverges between the two populations when unqualified decks exist", () => {
    const { publicMatchupData, powerMatchupData } = buildMatchupPopulations(
      allDecks,
      qualifiedDecks,
      ["Alpha"]
    );

    expect(powerMatchupData["Alpha"]).not.toEqual(publicMatchupData["Alpha"]);
  });
});
