import { getPairings } from "../utils/get-pairings";
import { LimitlessError } from "../utils/limitless-client";
import { vi } from "vitest";

const respond = (status: number, body: unknown) =>
  vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Not Found",
    headers: new Headers(),
    json: () => Promise.resolve(body),
  });

describe("getPairings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("LIMITLESS_API_KEY", "test-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const mockTournament = { id: "tournament1" };

  it("should transform pairings correctly", async () => {
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

    global.fetch = respond(200, mockPairings);

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

  it("skips a pairing that has no winner instead of inventing an id", async () => {
    global.fetch = respond(200, [
      { winner: "player1", player1: "player1", player2: "player2" },
      { player1: "player1", player2: "player2" },
      { winner: "", player1: "player1", player2: "player2" },
    ]);

    const result = await getPairings(mockTournament as any);
    expect(result).toEqual([{ winner: "tournament1-player1", loser: "tournament1-player2" }]);
  });

  it("rejects with the HTTP status when the request fails", async () => {
    global.fetch = respond(404, {});

    const failure = await getPairings(mockTournament as any).catch((error) => error);
    expect(failure).toBeInstanceOf(LimitlessError);
    expect(failure.status).toBe(404);
  });
});
