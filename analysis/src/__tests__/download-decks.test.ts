import fs from "fs";
import { vi } from "vitest";
import { downloadDecks } from "../download-decks";

const { getTournamentDecks, getTournaments } = vi.hoisted(() => ({
  getTournamentDecks: vi.fn(),
  getTournaments: vi.fn(),
}));

vi.mock("../utils/get-tournament-decks", () => ({ default: getTournamentDecks }));
vi.mock("../utils/get-tournaments", () => ({ getTournaments }));
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
    vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);
  });

  it("writes both data files only after every tournament succeeds", async () => {
    getTournaments.mockResolvedValue([
      { id: "one", date: "2026-09-01" },
      { id: "two", date: "2026-09-02" },
    ]);
    getTournamentDecks.mockResolvedValueOnce([{ id: "deck-one" }]).mockResolvedValueOnce([{ id: "deck-two" }]);

    await downloadDecks();

    expect(fs.writeFileSync).toHaveBeenCalledTimes(2);
    expect(fs.writeFileSync).toHaveBeenNthCalledWith(1, "./data/decks.json", expect.stringContaining("deck-two"));
    expect(fs.writeFileSync).toHaveBeenNthCalledWith(2, "./data/processed-tournaments.json", expect.stringContaining("two"));
  });

  it("leaves both data files untouched when a tournament fails", async () => {
    getTournaments.mockResolvedValue([
      { id: "one", date: "2026-09-01" },
      { id: "two", date: "2026-09-02" },
    ]);
    getTournamentDecks.mockResolvedValueOnce([{ id: "deck-one" }]).mockRejectedValueOnce(new Error("pairings failed"));

    await expect(downloadDecks()).rejects.toThrow("pairings failed");

    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });
});