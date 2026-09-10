import { getPairings } from "../utils/get-pairings";
import { vi } from "vitest";

describe("getPairings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should transform pairings correctly", async () => {
    const mockTournament = { id: "tournament1" };
    const mockPairings = [
      {
        round: 1,
        phase: 1,
        table: 1,
        winner: "player1",
        player1: "player1",
        player2: "player2",
      },
      {
        round: 2,
        phase: 1,
        table: 2,
        winner: "player2",
        player1: "player1",
        player2: "player2",
      },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve(mockPairings),
    });

    const result = await getPairings(mockTournament as any);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      winner: "tournament1-player1",
      loser: "tournament1-player2",
    });
    expect(result[1]).toEqual({
      winner: "tournament1-player2",
      loser: "tournament1-player1",
    });
  });
});
