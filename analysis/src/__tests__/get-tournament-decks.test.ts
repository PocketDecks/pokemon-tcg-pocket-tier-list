import getTournamentDecks from "../utils/get-tournament-decks";
import { getPairings } from "../utils/get-pairings";
import { vi } from "vitest";

vi.mock("../utils/get-pairings");

const card = (name: string, count: number, number = "1") => ({
  name,
  count,
  set: "A1",
  number,
});

const standing = (player: string, pokemon: unknown[], trainer: unknown[], wins = 2, losses = 2) => ({
  player,
  decklist: { pokemon, trainer },
  record: { wins, losses },
});

const respond = (body: unknown) =>
  vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    headers: new Headers(),
    json: () => Promise.resolve(body),
  });

describe("getTournamentDecks", () => {
  const mockTournament = { id: "tournament1", date: "2024-01-01" };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("LIMITLESS_API_KEY", "test-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("names the tournament when the standings payload is not an array", async () => {
    global.fetch = respond({ error: "rate limited" });

    await expect(getTournamentDecks(mockTournament as any)).rejects.toThrow(
      "Tournament tournament1: standings response was object, expected an array"
    );
  });

  it("should process decks correctly", async () => {
    global.fetch = respond([
      standing("player1", [card("Pikachu ex", 2), card("Jigglypuff", 1, "2")], [card("Trainer1", 1, "3")], 3, 1),
      standing("player2", [card("Pikachu", 2, "4")], []),
    ]);
    vi.mocked(getPairings).mockResolvedValue([
      { winner: "tournament1-player1", loser: "tournament1-player2" },
    ]);

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
    expect(result[1]).toEqual(
      expect.objectContaining({
        id: "tournament1-player2",
        wins: [],
        losses: ["tournament1-player1"],
      })
    );
  });

  it("lists wins and losses in pairing order", async () => {
    global.fetch = respond([standing("a", [card("Mew", 2)], [card("Potion", 2, "5")])]);
    vi.mocked(getPairings).mockResolvedValue([
      { winner: "tournament1-a", loser: "tournament1-x" },
      { winner: "tournament1-y", loser: "tournament1-a" },
      { winner: "tournament1-a", loser: "tournament1-z" },
    ]);

    const [deck] = await getTournamentDecks(mockTournament as any);
    expect(deck.wins).toEqual(["tournament1-x", "tournament1-z"]);
    expect(deck.losses).toEqual(["tournament1-y"]);
  });

  it("skips decks whose cards lack a set or number and warns once", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    global.fetch = respond([
      standing("good", [card("Mew", 2)], [card("Potion", 2, "5")]),
      standing("noset", [{ name: "Mew", count: 2, number: "1" }], []),
      standing("nonumber", [{ name: "Mew", count: 2, set: "A1" }], []),
    ]);
    vi.mocked(getPairings).mockResolvedValue([]);

    const result = await getTournamentDecks(mockTournament as any);
    expect(result.map((deck) => deck.id)).toEqual(["tournament1-good"]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("skipped 2 decks with malformed cards");
    warn.mockRestore();
  });

  it("ignores players who submitted no decklist without warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    global.fetch = respond([
      { player: "ghost", record: { wins: 1, losses: 1 } },
      standing("good", [card("Mew", 2)], []),
    ]);
    vi.mocked(getPairings).mockResolvedValue([]);

    const result = await getTournamentDecks(mockTournament as any);
    expect(result).toHaveLength(1);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("returns nothing and skips the pairings request when no deck is usable", async () => {
    global.fetch = respond([{ player: "ghost", record: { wins: 1, losses: 1 } }]);

    expect(await getTournamentDecks(mockTournament as any)).toEqual([]);
    expect(getPairings).not.toHaveBeenCalled();
  });
});
