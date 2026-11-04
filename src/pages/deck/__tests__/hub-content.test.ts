import { describe, expect, it } from "vitest";
import {
  coreCardsOf,
  hubPeak,
  mostIncluded,
  newestFirst,
  parseCardEntry,
  pickMatchups,
  similarDecks,
} from "../hub-content";
import type { FullDeckType } from "../../../app/deck-types";
import type { HubVariantRecord } from "../../../app/use-hub-file";

const record = (overrides: Partial<HubVariantRecord> & { variant: string }): HubVariantRecord => ({
  name: overrides.variant,
  firstSeen: "2025-10-01",
  lastSeen: "2026-01-01",
  peakShare: null,
  peakDate: null,
  cards: [],
  ...overrides,
});

const deck = (name: string, cardIds: string[]) =>
  ({
    name,
    bestList: { cards: cardIds.map((id) => ({ id })) },
  }) as unknown as FullDeckType;

describe("parseCardEntry", () => {
  it("splits a count and card id", () => {
    expect(parseCardEntry("2:b2b-007")).toEqual({ count: 2, id: "b2b-007" });
  });

  it("rejects an entry without a count", () => {
    expect(parseCardEntry("b2b-007")).toBeNull();
  });
});

describe("coreCardsOf", () => {
  it("keeps only the entries it can parse", () => {
    expect(coreCardsOf(["2:a1-004", "not a card", "1:b1-073"])).toEqual([
      { count: 2, id: "a1-004" },
      { count: 1, id: "b1-073" },
    ]);
  });
});

describe("mostIncluded", () => {
  it("orders by count, highest first, and keeps the limit", () => {
    const cards = [
      { count: 1, id: "a" },
      { count: 2, id: "b" },
      { count: 1, id: "c" },
      { count: 2, id: "d" },
    ];
    expect(mostIncluded(cards, 3).map((card) => card.id)).toEqual(["b", "d", "a"]);
  });
});

describe("pickMatchups", () => {
  const live = new Set(["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta"]);
  const matchups = [
    { name: "alpha", winRate: 0.9, totalGames: 40 },
    { name: "beta", winRate: 0.8, totalGames: 20 },
    { name: "gamma", winRate: 0.6, totalGames: 19 },
    { name: "delta", winRate: 0.5, totalGames: 30 },
    { name: "epsilon", winRate: 0.3, totalGames: 30 },
    { name: "zeta", winRate: 0.1, totalGames: 30 },
    { name: "eta", winRate: 0.2, totalGames: 30 },
    { name: "self", winRate: 0.4, totalGames: 50 },
    { name: "not-live", winRate: 0.95, totalGames: 50 },
  ];

  it("takes three best and three worst, leaving out games at or below the minimum", () => {
    const { best, worst } = pickMatchups(matchups, "self", live, 20, 3);
    expect(best.map((m) => m.name)).toEqual(["alpha", "delta", "epsilon"]);
    expect(worst.map((m) => m.name)).toEqual(["zeta", "eta"]);
  });

  it("never lists one opponent as both a best and a worst matchup", () => {
    const { best, worst } = pickMatchups(
      [
        { name: "alpha", winRate: 0.9, totalGames: 30 },
        { name: "beta", winRate: 0.1, totalGames: 30 },
      ],
      "self",
      new Set(["alpha", "beta"]),
      20,
      3
    );
    expect(best.map((m) => m.name)).toEqual(["alpha", "beta"]);
    expect(worst.map((m) => m.name)).toEqual([]);
  });
});

describe("similarDecks", () => {
  const core = new Set(["a1-004", "b1-073", "b2b-007"]);

  it("ranks other hubs' decks by distinct shared cards and drops decks with none", () => {
    const decks = [
      deck("venusaur-ex-a1-004&bulbasaur-a1-001", ["a1-004", "a1-004", "b2b-007", "a1-001"]),
      deck("greninja-b1-073", ["b1-073"]),
      deck("zoroark-ex-b3-106", ["a1-001"]),
      deck("mega-greninja-ex-c1-042&greninja-a1-089", ["b2b-007", "b1-073"]),
    ];
    const similar = similarDecks(decks, core, "mega-greninja-ex", 3);
    expect(similar.map((entry) => [entry.deck.name, entry.shared])).toEqual([
      ["venusaur-ex-a1-004&bulbasaur-a1-001", 2],
      ["greninja-b1-073", 1],
    ]);
  });

  it("returns at most the limit", () => {
    const decks = [
      deck("alpha-a1-001", ["a1-004"]),
      deck("beta-a1-002", ["a1-004", "b1-073"]),
      deck("gamma-a1-003", ["b2b-007"]),
      deck("delta-a1-004", ["b1-073"]),
    ];
    expect(similarDecks(decks, core, "none", 3)).toHaveLength(3);
  });
});

describe("newestFirst", () => {
  it("orders variants by last sighting, newest first", () => {
    const ordered = newestFirst([
      record({ variant: "old", lastSeen: "2025-12-01" }),
      record({ variant: "new", lastSeen: "2026-03-01" }),
    ]);
    expect(ordered.map((entry) => entry.variant)).toEqual(["new", "old"]);
  });
});

describe("hubPeak", () => {
  it("returns the highest peak share and the date it was seen", () => {
    expect(
      hubPeak([
        record({ variant: "a", peakShare: 0.05, peakDate: "2025-11-01" }),
        record({ variant: "b", peakShare: 0.12, peakDate: "2026-10-29" }),
        record({ variant: "c" }),
      ])
    ).toEqual({ share: 0.12, date: "2026-10-29" });
  });

  it("returns null when no variant has a peak", () => {
    expect(hubPeak([record({ variant: "a" })])).toBeNull();
  });
});
