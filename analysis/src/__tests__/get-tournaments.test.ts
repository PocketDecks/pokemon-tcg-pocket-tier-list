import { getTournaments } from "../utils/get-tournaments";
import fs from "fs";
import { vi } from "vitest";

vi.mock("fs");

describe("getTournaments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify([]));
  });

  it("should filter tournaments based on minimum games", async () => {
    const mockTournaments = [
      { id: "1", players: 25 },
      { id: "2", players: 75 },
      { id: "3", players: 200 },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: () => Promise.resolve(mockTournaments),
    });

    const result = await getTournaments();
    expect(result).toHaveLength(2);
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "2", players: 75 }),
        expect.objectContaining({ id: "3", players: 200 }),
      ])
    );
  });

  it("should filter out processed tournaments", async () => {
    const mockTournaments = [
      { id: "1", players: 150 },
      { id: "2", players: 150 },
    ];

    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify([{ id: "1" }])
    );

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: () => Promise.resolve(mockTournaments),
    });

    const result = await getTournaments();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("2");
  });
});
