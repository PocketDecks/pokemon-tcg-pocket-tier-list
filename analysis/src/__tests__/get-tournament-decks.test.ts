import getTournamentDecks from "../utils/get-tournament-decks";
import { getPairings } from "../utils/get-pairings";
import { vi } from "vitest";

vi.mock("../utils/get-pairings");

describe("getDecks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should process decks correctly", async () => {
    const mockTournament = { id: "tournament1", date: "2024-01-01" };
    const mockDecks = [
      {
        player: "player1",
        decklist: {
          pokemon: [
            { name: "Pikachu ex", count: 2 },
            { name: "Jigglypuff", count: 1 },
          ],
          trainer: [{ name: "Trainer1", count: 1 }],
        },
        record: { wins: 3, losses: 1 },
      },
      {
        player: "player2",
        decklist: {
          pokemon: [{ name: "Pikachu", count: 2 }],
          trainer: [],
        },
        record: { wins: 2, losses: 2 },
      },
    ];

    const mockPairings = [
      { winner: "tournament1-player1", loser: "tournament1-player2" },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: () => Promise.resolve(mockDecks),
    });

    vi.mocked(getPairings).mockResolvedValue(mockPairings);

    const result = await getTournamentDecks(mockTournament as any);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(
      expect.objectContaining({
        id: "tournament1-player1",
        pokemon: 3,
        differentPokemon: 2,
        winCount: 3,
        lossCount: 1,
        totalGames: 4,
        tournamentExPercent: 0.5,
        noTrainerPercent: 0.5,
        wins: ["tournament1-player2"],
        losses: [],
      })
    );
  });
});
