import fs from "fs";
import os from "os";
import path from "path";
import { vi } from "vitest";
import fixtureDecks from "../__fixtures__/decks.json";
import { planDeckWrites } from "../utils/deck-store";
import getDecks from "../utils/get-decks";
import { Deck } from "../utils/types";

const commit = (files: Record<string, string>) => {
  for (const [target, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
};

describe("getDecks", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "get-decks-"));
    commit(planDeckWrites(dir, fixtureDecks as Deck[]));
    vi.stubEnv("DECKS_DIR", dir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("does not open shards that end before the current release", () => {
    const old = { ...fixtureDecks[0], id: "old-deck", date: "2025-02-01T00:00:00.000Z" } as Deck;
    commit(planDeckWrites(dir, [old]));
    const read = vi.spyOn(fs, "readFileSync");

    const ids = getDecks().map((deck) => deck.id);

    expect(ids).not.toContain("old-deck");
    expect(read.mock.calls.some((call) => String(call[0]).endsWith("a2.ndjson"))).toBe(false);
  });

  it("names the decks it returns", () => {
    expect(getDecks().every((deck) => typeof deck.name === "string" && deck.name.length > 0)).toBe(true);
  });

  it("fails with a clear message when the store is unreadable", () => {
    fs.writeFileSync(path.join(dir, "manifest.json"), "{not json");
    expect(() => getDecks()).toThrow("Failed to read decks store");
  });

  it("should return decks", () => {
    const decks = getDecks();
    expect(decks.length).toBeGreaterThan(0);

    // Check the first deck rather than a random one, so the assertion is reproducible.
    const testDeck = decks[0];
    expect(testDeck.id).toBeDefined();
    expect(testDeck.id.length).toBeGreaterThan(10);
    expect(testDeck.cards.length).toBeGreaterThan(0);
    expect(
      testDeck.cards.every(
        (card) => card.name && typeof card.name === "string"
      )
    ).toBe(true);
    expect(
      testDeck.cards.every(
        (card) => card.count && typeof card.count === "number" && card.count > 0
      )
    ).toBe(true);
    expect(
      testDeck.cards.every((card) => card.set && typeof card.set === "string")
    ).toBe(true);
    expect(
      testDeck.cards.every(
        (card) => card.number && typeof card.number === "string"
      )
    ).toBe(true);
    expect(testDeck.pokemon).toBeGreaterThan(0);
    expect(testDeck.differentPokemon).toBeGreaterThan(0);
    expect(testDeck.winCount).toBeDefined();
    expect(testDeck.lossCount).toBeDefined();
    expect(testDeck.totalGames).toBeGreaterThan(0);
    expect(new Date(testDeck.date).toISOString()).toBeDefined();
    expect(testDeck.tournamentExPercent).toBeDefined();
    expect(testDeck.noTrainerPercent).toBeDefined();
    expect(testDeck.wins).toBeDefined();
    expect(testDeck.wins.length + testDeck.losses.length).toBeGreaterThan(0);
    expect(testDeck.losses).toBeDefined();
    expect(testDeck.name).toBeDefined();
    expect(testDeck.name.length).toBeGreaterThan(0);
  });
});
