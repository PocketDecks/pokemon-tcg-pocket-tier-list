import getDeckName, {
  isUnmatchedDeck,
  UNMATCHED_DECK,
} from "../utils/get-deck-name";
import { SET_CODE_PATTERN } from "../utils/set-codes";
import {
  buildWindowArtefacts,
  unmatchedDecksInWindow,
} from "../utils/build-window-artefacts";
import { MIN_ARCHETYPE_QUALIFIED_GAMES, MIN_WINRATE_THRESHOLD } from "../settings";
import { Deck } from "../utils/types";

const TODAY = new Date("2026-10-10T12:00:00Z");

const mkDeck = (id: string, name: string, overrides: Partial<Deck> = {}): Deck => ({
  id,
  name,
  cards: [{ name: "Bulbasaur", count: 2, set: "A1", number: "1" }],
  pokemon: 1,
  differentPokemon: 1,
  winCount: 30,
  lossCount: 0,
  totalGames: 30,
  date: "2026-10-08",
  tournamentExPercent: 0,
  noTrainerPercent: 0,
  wins: [],
  losses: [],
  ...overrides,
});

const unmatchedDeck = (id: string, overrides: Partial<Deck> = {}): Deck =>
  mkDeck(id, UNMATCHED_DECK, {
    cards: [{ name: "Nothing At All", count: 2, set: "A1", number: "1" }],
    ...overrides,
  });

describe("the unmatched-deck sentinel", () => {
  it("names a deck that matches no listing with the sentinel", () => {
    const deck = mkDeck("id", "Test Deck", {
      cards: [{ name: "Nothing At All", count: 2, set: "A1", number: "1" }],
    });

    expect(getDeckName(deck)).toBe(UNMATCHED_DECK);
  });

  it("carries no set code and no number, so it cannot equal a card slug", () => {
    expect(new RegExp(`^(?:${SET_CODE_PATTERN})`, "i").test(UNMATCHED_DECK)).toBe(
      false
    );
    expect(/\d/.test(UNMATCHED_DECK)).toBe(false);
  });

  it("is recognised by isUnmatchedDeck and nothing else is", () => {
    expect(isUnmatchedDeck(UNMATCHED_DECK)).toBe(true);
    expect(isUnmatchedDeck("professor's-research-pa-007")).toBe(false);
    expect(isUnmatchedDeck("magnezone-b1a-026")).toBe(false);
    expect(isUnmatchedDeck("")).toBe(false);
  });
});

describe("a window holding unmatched decks", () => {
  const field = [
    mkDeck("alpha-1", "Alpha", { wins: Array(30).fill("Beta") }),
    mkDeck("alpha-2", "Alpha", { wins: Array(30).fill("Beta") }),
    mkDeck("beta-1", "Beta", { wins: Array(30).fill("Alpha") }),
    mkDeck("beta-2", "Beta", { wins: Array(30).fill("Alpha") }),
    unmatchedDeck("unmatched-1"),
    unmatchedDeck("unmatched-2"),
    unmatchedDeck("unmatched-3"),
  ];

  it("ranks only the real archetypes", () => {
    const names = buildWindowArtefacts(field, "10d", TODAY).bestDecks.map(
      (deck) => deck.name
    );

    expect(names.sort()).toEqual(["Alpha", "Beta"]);
    expect(names).not.toContain(UNMATCHED_DECK);
  });

  it("keeps the bucket out of the meta-share entries", () => {
    const entries = buildWindowArtefacts(field, "10d", TODAY).metaShare.decks.map(
      (entry) => entry.name
    );

    expect(entries).not.toContain(UNMATCHED_DECK);
  });

  it("gives the bucket no matchup table while a deck that beat it names the bucket as an opponent", () => {
    const bucketGames = [
      mkDeck("alpha-1", "Alpha", { wins: Array(30).fill(UNMATCHED_DECK) }),
      unmatchedDeck("unmatched-1", { losses: Array(30).fill("Alpha") }),
    ];
    const bucket = unmatchedDecksInWindow(bucketGames, "10d", TODAY);

    expect(bucket.decks).toBe(1);
    expect(bucket.games).toBeGreaterThanOrEqual(MIN_ARCHETYPE_QUALIFIED_GAMES);

    const data = buildWindowArtefacts(bucketGames, "10d", TODAY).matchupData;

    expect(Object.keys(data)).toEqual(["Alpha"]);
    expect(data["Alpha"].map((row) => row.name)).toContain(UNMATCHED_DECK);
    expect(data["Alpha"].find((row) => row.name === UNMATCHED_DECK)).toEqual({
      name: UNMATCHED_DECK,
      winRate: 1,
      totalGames: 30,
    });
  });

  it("divides every real archetype's share by the full qualified field, bucket included", () => {
    // The bucket is dropped from the published rows, not from the field the
    // shares divide by: a deck that matched no listing still played games, and
    // its games stay in the denominator every archetype's share is measured
    // against. Alpha and Beta each hold 60 of the field's 210 qualified games.
    const artefacts = buildWindowArtefacts(field, "10d", TODAY);
    const total = field.reduce((sum, deck) => sum + deck.totalGames, 0);

    for (const deck of artefacts.bestDecks) {
      expect(deck.percentOfGames).toBeCloseTo(60 / total, 10);
    }
  });

  it("reports the unmatched deck count and their qualified games", () => {
    const qualified = field.filter(
      (deck) =>
        deck.totalGames > 0 && deck.winCount / deck.totalGames >= MIN_WINRATE_THRESHOLD
    );
    const expected = qualified.filter((deck) => isUnmatchedDeck(deck.name));

    const counted = unmatchedDecksInWindow(field, "10d", TODAY);

    expect(counted.decks).toBe(expected.length);
    expect(counted.games).toBe(
      expected.reduce((sum, deck) => sum + deck.totalGames, 0)
    );
    expect(counted.decks).toBeGreaterThan(0);
  });

  it("does not count an unqualified unmatched deck", () => {
    const weak = unmatchedDeck("weak", { winCount: 1, totalGames: 30 });

    expect(unmatchedDecksInWindow([...field, weak], "10d", TODAY).decks).toBe(3);
  });
});
