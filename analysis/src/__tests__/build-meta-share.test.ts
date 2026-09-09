import { buildMetaShare, WINDOW_DAYS } from "../utils/build-meta-share";
import { Deck, PartialDeck } from "../utils/types";

const TODAY = new Date("2026-08-24T12:00:00Z");

const makeDeck = (overrides: Partial<Deck>): Deck => ({
  id: "id",
  name: "Deck A",
  cards: [],
  pokemon: 0,
  differentPokemon: 0,
  winCount: 0,
  lossCount: 0,
  totalGames: 0,
  date: "2026-08-20T00:00:00.000Z",
  tournamentExPercent: 0,
  noTrainerPercent: 0,
  wins: [],
  losses: [],
  ...overrides,
});

const makePartial = (name: string, score = 1): PartialDeck => ({
  name,
  lists: [{ cards: [], score, strength: 1 }],
  popularity: 1,
  percentOfGames: 0.1,
  score,
  expectedWinRate: 0.5,
  fieldCoverage: 0,
  powerScore: null,
  freqScore: 0,
  metaScore: null,
});

const daysAgo = (n: number) =>
  new Date(TODAY.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

describe("buildMetaShare", () => {
  it("shares within the current window sum to ~1.0 across tracked decks", () => {
    const qualifiedDecks: Deck[] = [
      makeDeck({ name: "Deck A", date: daysAgo(1), totalGames: 30 }),
      makeDeck({ name: "Deck B", date: daysAgo(2), totalGames: 10 }),
    ];
    const bestDecks = [makePartial("Deck A"), makePartial("Deck B")];

    const ms = buildMetaShare(qualifiedDecks, bestDecks, TODAY);

    const sum = ms.decks.reduce((acc, d) => acc + d.share, 0);
    expect(sum).toBeCloseTo(1.0, 6);
    expect(ms.windowDays).toBe(WINDOW_DAYS);
  });

  it("a deck played only in the previous window has negative delta and share 0", () => {
    const qualifiedDecks: Deck[] = [
      makeDeck({ name: "Old Deck", date: daysAgo(10), totalGames: 40 }),
      // one current-window deck so prevTotal is non-zero
      makeDeck({ name: "Deck B", date: daysAgo(1), totalGames: 10 }),
    ];
    const bestDecks = [makePartial("Old Deck"), makePartial("Deck B")];

    const ms = buildMetaShare(qualifiedDecks, bestDecks, TODAY);

    const old = ms.decks.find((d) => d.name === "Old Deck")!;
    expect(old.share).toBe(0);
    expect(old.sharePrev).toBeGreaterThan(0);
    expect(old.delta).toBeLessThan(0);
  });

  it("a brand-new deck is flagged isNew with zero previous share", () => {
    const qualifiedDecks: Deck[] = [
      makeDeck({ name: "New Deck", date: daysAgo(0), totalGames: 15 }),
      makeDeck({ name: "Deck B", date: daysAgo(3), totalGames: 15 }),
    ];
    const bestDecks = [makePartial("New Deck"), makePartial("Deck B")];

    const ms = buildMetaShare(qualifiedDecks, bestDecks, TODAY);

    const fresh = ms.decks.find((d) => d.name === "New Deck")!;
    expect(fresh.isNew).toBe(true);
    expect(fresh.sharePrev).toBe(0);
    expect(fresh.firstSeen).toBe(daysAgo(0).split("T")[0]);
  });

  it("decks absent from bestDecks are excluded even when they have games", () => {
    const qualifiedDecks: Deck[] = [
      makeDeck({ name: "Untracked", date: daysAgo(1), totalGames: 99 }),
      makeDeck({ name: "Tracked", date: daysAgo(1), totalGames: 10 }),
    ];
    const bestDecks = [makePartial("Tracked")];

    const ms = buildMetaShare(qualifiedDecks, bestDecks, TODAY);

    expect(ms.decks).toHaveLength(1);
    expect(ms.decks[0].name).toBe("Tracked");
    expect(ms.decks[0].share).toBe(1); // untracked games don't dilute
  });

  it("empty windows produce zero shares without NaN", () => {
    const qualifiedDecks: Deck[] = [
      makeDeck({ name: "Ancient", date: "2025-01-01T00:00:00.000Z", totalGames: 50 }),
    ];
    const bestDecks = [makePartial("Ancient")];

    const ms = buildMetaShare(qualifiedDecks, bestDecks, TODAY);

    for (const d of ms.decks) {
      expect(Number.isNaN(d.share)).toBe(false);
      expect(Number.isNaN(d.sharePrev)).toBe(false);
      expect(Number.isNaN(d.delta)).toBe(false);
      expect(Number.isNaN(d.games14 ?? 0)).toBe(false);
    }
  });

  it("games14 counts qualified games in the trailing 14 days", () => {
    const qualifiedDecks: Deck[] = [
      makeDeck({ name: "Deck A", date: daysAgo(1), totalGames: 30 }),
      makeDeck({ name: "Deck A", date: daysAgo(10), totalGames: 20 }),
      // outside the 14-day window: must not count
      makeDeck({ name: "Deck A", date: daysAgo(20), totalGames: 99 }),
    ];
    const bestDecks = [makePartial("Deck A")];

    const ms = buildMetaShare(qualifiedDecks, bestDecks, TODAY);

    expect(ms.decks[0].games14).toBe(50);
  });
});
