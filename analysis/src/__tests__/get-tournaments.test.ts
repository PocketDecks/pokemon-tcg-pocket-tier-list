import { getTournaments } from "../utils/get-tournaments";
import fs from "fs";
import { vi } from "vitest";

vi.mock("fs");

const respond = (body: unknown) =>
  vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    headers: new Headers(),
    json: () => Promise.resolve(body),
  });

describe("getTournaments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("LIMITLESS_API_KEY", "test-key");
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify([]));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should filter tournaments based on minimum players", async () => {
    global.fetch = respond([
      { id: "1", players: 25 },
      { id: "2", players: 75 },
      { id: "3", players: 200 },
    ]);

    const result = await getTournaments();
    expect(result).toHaveLength(2);
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "2", players: 75 }),
        expect.objectContaining({ id: "3", players: 200 }),
      ])
    );
  });

  it("keeps a tournament with exactly the minimum players and drops one without a count", async () => {
    global.fetch = respond([
      { id: "at", players: 50 },
      { id: "under", players: 49 },
      { id: "unknown" },
    ]);

    const result = await getTournaments();
    expect(result.map((tournament) => tournament.id)).toEqual(["at"]);
  });

  it("should filter out processed tournaments", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify([{ id: "1" }]));
    global.fetch = respond([
      { id: "1", players: 150 },
      { id: "2", players: 150 },
    ]);

    const result = await getTournaments();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("2");
  });

  it("returns each tournament id once when the listing repeats one", async () => {
    // The listing is paged, so the same id can arrive twice. A repeat would be
    // downloaded twice and then trip the duplicate guard in planDeckWrites.
    global.fetch = respond([
      { id: "1", players: 150 },
      { id: "2", players: 150 },
      { id: "1", players: 150 },
      { id: "2", players: 150 },
    ]);

    expect((await getTournaments()).map((tournament) => tournament.id)).toEqual(["1", "2"]);
  });

  it("keeps the first row when a repeated id carries different counts", async () => {
    global.fetch = respond([
      { id: "1", players: 150 },
      { id: "1", players: 20 },
    ]);

    const result = await getTournaments();
    expect(result).toHaveLength(1);
    expect(result[0].players).toBe(150);
  });

  it("keeps only the standard-format rows in a mixed listing", async () => {
    global.fetch = respond([
      { id: "null", players: 150, format: null },
      { id: "standard", players: 150, format: "STANDARD" },
      { id: "custom", players: 150, format: "CUSTOM" },
      { id: "noex", players: 150, format: "NOEX" },
    ]);

    expect((await getTournaments()).map((tournament) => tournament.id)).toEqual([
      "null",
      "standard",
    ]);
  });

  it("treats a missing processed file as nothing processed", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    global.fetch = respond([{ id: "1", players: 150 }]);

    expect((await getTournaments()).map((tournament) => tournament.id)).toEqual(["1"]);
  });
});
