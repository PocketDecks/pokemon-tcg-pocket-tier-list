import {
  buildArtefactFiles,
  buildWindowArtefacts,
  WINDOW_IDS,
  WINDOW_LENGTH_DAYS,
  WindowArtefacts,
  WindowId,
} from "../utils/build-window-artefacts";
import { Deck } from "../utils/types";

const TODAY = new Date("2026-10-10T12:00:00Z");

const CARD = { name: "Bulbasaur", count: 2, set: "A1", number: "1" };

const makeDeck = (overrides: Partial<Deck>): Deck => ({
  id: "id",
  name: "Alpha",
  cards: [CARD],
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

const artefactsByWindow = (decks: Deck[], today: Date) =>
  Object.fromEntries(
    WINDOW_IDS.map((w) => [w, buildWindowArtefacts(decks, w, today)])
  ) as Record<WindowId, WindowArtefacts>;

const beta = (artefacts: WindowArtefacts, name = "Alpha") =>
  artefacts.matchupData[name].find((row) => row.name === "Beta")!;

describe("WINDOW_IDS", () => {
  it("lists the four selectable windows in order", () => {
    expect(WINDOW_IDS).toEqual(["10d", "20d", "30d", "all"]);
    expect(WINDOW_LENGTH_DAYS).toEqual({ "10d": 10, "20d": 20, "30d": 30, all: null });
  });
});

describe("buildWindowArtefacts window boundary", () => {
  it("keeps a deck on the window's first day and drops the day before", () => {
    const anchor = makeDeck({ id: "anchor", name: "Anchor", date: "2026-10-10" });
    const inside = makeDeck({ id: "inside", name: "Inside", date: "2026-10-01" });
    const outside = makeDeck({ id: "outside", name: "Outside", date: "2026-09-30" });

    const names = buildWindowArtefacts([anchor, inside, outside], "10d", TODAY)
      .bestDecks.map((deck) => deck.name);

    expect(names).toContain("Inside");
    expect(names).not.toContain("Outside");
  });

  it("keeps every deck for the all-time window", () => {
    const old = makeDeck({ id: "old", name: "Old", date: "2025-01-01" });
    const anchor = makeDeck({ id: "anchor", name: "Anchor", date: "2026-10-10" });

    const names = buildWindowArtefacts([old, anchor], "all", TODAY)
      .bestDecks.map((deck) => deck.name)
      .sort();

    expect(names).toEqual(["Anchor", "Old"]);
  });
});

describe("buildWindowArtefacts flat weighting", () => {
  // Two qualified Alpha decks against Beta, dated ten days apart. The recency
  // ramp would scale the newer deck up, pulling the pooled win rate toward its
  // 0.8; flat weighting pools 30-0 with 24-6 for exactly 54/60.
  const older = makeDeck({
    id: "older",
    name: "Alpha",
    date: "2026-10-01",
    winCount: 30,
    totalGames: 30,
    wins: Array(30).fill("Beta"),
  });
  const newer = makeDeck({
    id: "newer",
    name: "Alpha",
    date: "2026-10-08",
    winCount: 24,
    lossCount: 6,
    totalGames: 30,
    wins: Array(24).fill("Beta"),
    losses: Array(6).fill("Beta"),
  });

  it("pools every in-window game with equal weight", () => {
    const row = beta(buildWindowArtefacts([older, newer], "10d", TODAY));

    expect(row.totalGames).toBe(60);
    expect(row.winRate).toBeCloseTo(0.9, 10);
  });

  it("is unchanged when the two decks swap dates", () => {
    const swapped = [
      { ...older, date: "2026-10-08" },
      { ...newer, date: "2026-10-01" },
    ];

    expect(beta(buildWindowArtefacts(swapped, "10d", TODAY))).toEqual(
      beta(buildWindowArtefacts([older, newer], "10d", TODAY))
    );
  });
});

describe("buildWindowArtefacts meta share window", () => {
  it("anchors the share window to the newest data date, not the run date", () => {
    // The run happens weeks after the last data, so a window built from the run
    // date would be empty and every share would read zero.
    const lateRun = new Date("2026-11-01T12:00:00Z");
    const decks = [makeDeck({ name: "Alpha", date: "2026-10-08", totalGames: 30 })];

    const share = buildWindowArtefacts(decks, "10d", lateRun).metaShare;

    expect(share.windowDays).toBe(10);
    expect(share.decks[0].share).toBeGreaterThan(0);
  });

  it("reports the window length and null for all-time", () => {
    const decks = [makeDeck({ name: "Alpha", date: "2026-10-08", totalGames: 30 })];

    expect(buildWindowArtefacts(decks, "20d", TODAY).metaShare.windowDays).toBe(20);
    expect(buildWindowArtefacts(decks, "all", TODAY).metaShare.windowDays).toBeNull();
  });
});

describe("buildWindowArtefacts empty window", () => {
  it("fails closed with empty artefacts instead of inventing scores", () => {
    const artefacts = buildWindowArtefacts([], "10d", TODAY);

    expect(artefacts.bestDecks).toEqual([]);
    expect(artefacts.metaShare.decks).toEqual([]);
    expect(artefacts.matchupData).toEqual({});
  });
});

describe("buildWindowArtefacts across windows", () => {
  // A three-archetype field with games spread over a month: the 10d window
  // drops the oldest, the 30d and all-time windows keep it. Enough games per
  // archetype to clear MIN_ARCHETYPE_QUALIFIED_GAMES in every window.
  const spread = [
    makeDeck({ id: "a1", name: "Alpha", date: "2026-10-10", winCount: 40, totalGames: 40, wins: Array(40).fill("Beta") }),
    makeDeck({ id: "a2", name: "Alpha", date: "2026-09-20", winCount: 40, totalGames: 40, wins: Array(40).fill("Gamma") }),
    makeDeck({ id: "b1", name: "Beta", date: "2026-10-05", winCount: 40, totalGames: 40, wins: Array(40).fill("Alpha") }),
    makeDeck({ id: "b2", name: "Beta", date: "2026-09-15", winCount: 40, totalGames: 40, wins: Array(40).fill("Gamma") }),
    makeDeck({ id: "g1", name: "Gamma", date: "2026-10-08", winCount: 40, totalGames: 40, wins: Array(40).fill("Alpha") }),
    makeDeck({ id: "g2", name: "Gamma", date: "2026-09-25", winCount: 40, totalGames: 40, wins: Array(40).fill("Beta") }),
    // Older than 30 days, so only the all-time window keeps it.
    makeDeck({ id: "d1", name: "Delta", date: "2026-08-20", winCount: 40, totalGames: 40, wins: Array(40).fill("Alpha") }),
    makeDeck({ id: "d2", name: "Delta", date: "2026-08-25", winCount: 40, totalGames: 40, wins: Array(40).fill("Beta") }),
  ];

  it("scores a finite Power Score and positive games in every window", () => {
    for (const w of WINDOW_IDS) {
      const artefacts = buildWindowArtefacts(spread, w, TODAY);

      expect(artefacts.bestDecks.length).toBeGreaterThan(0);
      for (const deck of artefacts.bestDecks) {
        expect(Number.isFinite(deck.powerScore ?? NaN)).toBe(true);
        expect(deck.freqScore).toBeGreaterThan(0);
        expect(deck.expectedWinRate).toBeGreaterThan(0);
      }
      for (const entry of artefacts.metaShare.decks) {
        expect(entry.windowGames).toBeGreaterThan(0);
      }
    }
  });

  it("carries fewer games in the shorter window", () => {
    const games = (w: (typeof WINDOW_IDS)[number]) =>
      buildWindowArtefacts(spread, w, TODAY).metaShare.decks.reduce(
        (sum, entry) => sum + entry.windowGames,
        0
      );

    expect(games("10d")).toBeLessThan(games("30d"));
    expect(games("30d")).toBeLessThan(games("all"));
  });
});

describe("buildArtefactFiles", () => {
  const decks = [
    makeDeck({ id: "anchor", name: "Anchor", date: "2026-10-10", totalGames: 30 }),
  ];

  it("emits a suffixed artefact set for every window", () => {
    const files = buildArtefactFiles(artefactsByWindow(decks, TODAY));

    for (const w of WINDOW_IDS) {
      expect(files[`../public/data/best-decks-${w}.json`]).toBeDefined();
      expect(files[`../public/data/meta-share-${w}.json`]).toBeDefined();
      expect(files[`../public/data/matchup-data-${w}.json`]).toBeDefined();
    }
  });

  it("writes un-suffixed copies that match the 20d set", () => {
    const files = buildArtefactFiles(artefactsByWindow(decks, TODAY));

    expect(files["../public/data/best-decks.json"]).toBe(
      files["../public/data/best-decks-20d.json"]
    );
    expect(files["../public/data/meta-share.json"]).toBe(
      files["../public/data/meta-share-20d.json"]
    );
    expect(files["../public/data/matchup-data.json"]).toBe(
      files["../public/data/matchup-data-20d.json"]
    );
  });
});
