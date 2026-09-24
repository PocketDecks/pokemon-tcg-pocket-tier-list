import fs from "fs";
import { vi } from "vitest";
import { downloadDecks } from "../download-decks";

const { getTournamentDecks, getTournaments } = vi.hoisted(() => ({
  getTournamentDecks: vi.fn(),
  getTournaments: vi.fn(),
}));
const writeArtefacts = vi.hoisted(() => vi.fn());

vi.mock("../utils/get-tournament-decks", () => ({ default: getTournamentDecks }));
vi.mock("../utils/get-tournaments", () => ({ getTournaments }));
vi.mock("../utils/write-artifacts", () => ({ writeArtefacts }));
vi.mock("fs");

describe("downloadDecks", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.LIMITLESS_API_KEY = "test-key";
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation((path) =>
      String(path).endsWith("decks.json") ? "[{\"id\":\"old\"}]" : "[{\"id\":\"done\"}]"
    );
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
    writeArtefacts.mockImplementation(() => undefined);
  });

  it("writes both data files only after every tournament succeeds", async () => {
    getTournaments.mockResolvedValue([
      { id: "one", date: "2026-09-01" },
      { id: "two", date: "2026-09-02" },
    ]);
    getTournamentDecks.mockResolvedValueOnce([{ id: "deck-one" }]).mockResolvedValueOnce([{ id: "deck-two" }]);

    await downloadDecks();

    expect(writeArtefacts).toHaveBeenCalledTimes(1);
    const payload = writeArtefacts.mock.calls[0][0] as Record<string, string>;
    expect(JSON.parse(payload["./data/decks.json"])).toEqual([
      { id: "old" },
      { id: "deck-one" },
      { id: "deck-two" },
    ]);
    expect(JSON.parse(payload["./data/processed-tournaments.json"])).toEqual([
      { id: "done" },
      { id: "one", date: "2026-09-01" },
      { id: "two", date: "2026-09-02" },
    ]);
  });

  it("leaves both data files untouched when a tournament fails", async () => {
    getTournaments.mockResolvedValue([
      { id: "one", date: "2026-09-01" },
      { id: "two", date: "2026-09-02" },
    ]);
    getTournamentDecks.mockResolvedValueOnce([{ id: "deck-one" }]).mockRejectedValueOnce(new Error("pairings failed"));

    await expect(downloadDecks()).rejects.toThrow("pairings failed");

    expect(writeArtefacts).not.toHaveBeenCalled();
  });
});