import {
  MetaShareEntry,
  PipelineMatchupData,
  PipelinePartialDeck,
} from "../../../src/types/pipeline-data";
import { buildDeckPower, DeckPowerInput } from "./build-deck-power";
import { buildMatchupPopulations } from "./build-matchup-populations";
import { buildMetaShare, WindowMetaShare } from "./build-meta-share";
import { calculateCardScores } from "./calculate-card-scores";
import { calculateDeckScore } from "./calculate-deck-score";
import { calculateMatchupResults } from "./calculate-matchup-results";
import cardToString from "./card-to-string";
import { convertCardsToIds } from "./convert-cards";
import getId from "./get-id";
import { Deck } from "./types";
import {
  MIN_ARCHETYPE_QUALIFIED_GAMES,
  MIN_WINRATE_THRESHOLD,
} from "../settings";

export const WINDOW_IDS = ["10d", "20d", "30d", "all"] as const;
export type WindowId = (typeof WINDOW_IDS)[number];

// Trailing calendar-day length per window; null means the whole store.
export const WINDOW_LENGTH_DAYS: Record<WindowId, number | null> = {
  "10d": 10,
  "20d": 20,
  "30d": 30,
  all: null,
};

// The un-suffixed artefact filenames keep meaning this window, so readers that
// predate the selector stay on the same numbers.
export const DEFAULT_WINDOW: WindowId = "20d";

const DAY_MS = 24 * 60 * 60 * 1000;

const dayKey = (date: string) => date.split("T")[0];

export interface WindowArtefacts {
  bestDecks: PipelinePartialDeck[];
  metaShare: WindowMetaShare;
  matchupData: PipelineMatchupData;
}

// A deck row belongs to a window when its date falls inside the trailing N
// calendar days, inclusive, ending on the run's newest data date. The anchor is
// the data, not the run clock: a refresh that lands days after the last scrape
// would otherwise score an empty window.
const decksInWindow = (decks: Deck[], window: WindowId, anchor: Date): Deck[] => {
  const days = WINDOW_LENGTH_DAYS[window];
  if (days === null) return decks;

  const anchorKey = dayKey(anchor.toISOString());
  const anchorMs = new Date(`${anchorKey}T00:00:00Z`).getTime();
  const floorMs = anchorMs - (days - 1) * DAY_MS;

  return decks.filter((deck) => {
    const deckMs = new Date(`${dayKey(deck.date)}T00:00:00Z`).getTime();
    return deckMs >= floorMs && deckMs <= anchorMs;
  });
};

// Windows on calendar-day keys, so a deck dated mid-day lands on the same
// boundary as one dated at midnight. The anchor is the newest data date; the
// run clock only stands in when the store is empty.
const latestAnchor = (decks: Deck[], fallback: Date): Date => {
  const newestKey = decks.reduce((newest, deck) => {
    const key = dayKey(deck.date);
    return key > newest ? key : newest;
  }, "");
  return new Date(`${newestKey || dayKey(fallback.toISOString())}T00:00:00Z`);
};

// The qualification gate: a deck scores only when its player won at least
// MIN_WINRATE_THRESHOLD of their games. Evaluated per window, since the window
// holds a subset of the player's games.
const qualifiedInWindow = (decks: Deck[]): Deck[] =>
  decks.filter(
    (deck) =>
      deck.totalGames > 0 &&
      deck.winCount / deck.totalGames >= MIN_WINRATE_THRESHOLD
  );

// The qualified decks a window ranks. Exposed so the pipeline can build the
// non-windowed artefacts (trends, card scores) from the all-time set without
// re-deriving the window boundary.
export const qualifiedDecksInWindow = (
  decks: Deck[],
  window: WindowId,
  today: Date
): Deck[] =>
  qualifiedInWindow(decksInWindow(decks, window, latestAnchor(decks, today)));

const rankDecks = (
  qualifiedDecks: Deck[]
): { bestDecks: PipelinePartialDeck[]; rankedNames: string[] } => {
  const totalQualifiedGames = qualifiedDecks.reduce(
    (sum, deck) => sum + deck.totalGames,
    0
  );

  // An archetype needs MIN_ARCHETYPE_QUALIFIED_GAMES before it ranks, so a
  // one-deck fluke in a short window stays out of the table.
  const gamesByName = new Map<string, number>();
  for (const deck of qualifiedDecks) {
    gamesByName.set(deck.name, (gamesByName.get(deck.name) ?? 0) + deck.totalGames);
  }
  const rankedNames = [...new Set(qualifiedDecks.map((deck) => deck.name))].filter(
    (name) => (gamesByName.get(name) ?? 0) >= MIN_ARCHETYPE_QUALIFIED_GAMES
  );

  const bestDecks: PipelinePartialDeck[] = [];
  const idExists: Record<string, boolean> = {};

  for (const name of rankedNames) {
    const matching = qualifiedDecks.filter((deck) => deck.name === name);
    const matchingGames = matching.reduce((sum, deck) => sum + deck.totalGames, 0);

    const cards: Record<string, { winCount: number; totalGames: number }> = {};
    for (const deck of matching) {
      for (const card of deck.cards) {
        const key = cardToString(card);
        const entry = cards[key] ?? { winCount: 0, totalGames: 0 };
        entry.winCount += deck.winCount;
        entry.totalGames += deck.totalGames;
        cards[key] = entry;
      }
    }
    const scoredCards = calculateCardScores(cards, matchingGames);

    const lists = [];
    for (const deck of matching) {
      const id = getId(deck);
      if (idExists[id]) continue;
      const deckScore = calculateDeckScore(
        deck,
        scoredCards,
        matchingGames,
        totalQualifiedGames
      );
      lists.push({
        cards: convertCardsToIds(deck.cards),
        score: deckScore.score,
        strength: deckScore.strength,
      });
      idExists[id] = true;
    }

    bestDecks.push({
      name,
      lists,
      popularity: matchingGames / totalQualifiedGames,
      percentOfGames: matchingGames / totalQualifiedGames,
      score: lists.length ? Math.max(...lists.map((list) => list.score)) : 0,
      expectedWinRate: 0.5,
      fieldCoverage: 0,
      powerScore: null,
      freqScore: 0,
      metaScore: null,
    });
  }

  bestDecks.sort((a, b) => b.score - a.score);
  return { bestDecks, rankedNames };
};

// Rebuilds the four artefacts a window's rankings need. Every in-window game
// counts once: the recency ramp is retired, so only the window choice changes
// the weighting. Pure, so the tests drive it without a scrape.
export const buildWindowArtefacts = (
  decks: Deck[],
  window: WindowId,
  today: Date
): WindowArtefacts => {
  const anchor = latestAnchor(decks, today);
  const qualifiedDecks = qualifiedDecksInWindow(decks, window, today);
  const { bestDecks, rankedNames } = rankDecks(qualifiedDecks);

  const shareDays = WINDOW_LENGTH_DAYS[window];
  const metaShare = buildMetaShare(qualifiedDecks, bestDecks, today, {
    shareDays,
    gamesDays: shareDays,
    anchor,
  });

  // The public matrix keeps every player's games in the window, so displayed
  // win rates do not inherit the qualification gate's upward bias. Power Score
  // reads the qualified tally instead, matching the qualified field shares it
  // weights by.
  const { publicMatchupData, powerMatchupData } = buildMatchupPopulations(
    decksInWindow(decks, window, anchor),
    qualifiedDecks,
    rankedNames
  );

  const gamesByName = new Map(
    metaShare.decks.map((entry) => [entry.name, entry.windowGames])
  );
  const powerInputs: DeckPowerInput[] = bestDecks.map((deck) => ({
    name: deck.name,
    matchups: powerMatchupData[deck.name] ?? [],
    windowGames: gamesByName.get(deck.name) ?? 0,
  }));
  const powerByName = new Map(
    buildDeckPower(powerInputs).map((row) => [row.name, row] as const)
  );
  for (const deck of bestDecks) {
    const power = powerByName.get(deck.name);
    deck.expectedWinRate = power?.expectedWinRate ?? 0.5;
    deck.fieldCoverage = power?.fieldCoverage ?? 0;
    deck.powerScore = power?.powerScore ?? null;
    deck.freqScore = power?.freqScore ?? 0;
    deck.metaScore = power?.metaScore ?? null;
  }

  return { bestDecks, metaShare, matchupData: publicMatchupData };
};

const ARTEFACT_BASES = ["best-decks", "meta-share", "matchup-data"] as const;

// Maps every window's payloads onto the files get-best-decks.ts writes. The
// default window is also written un-suffixed, so readers that predate the
// selector keep working without a migration.
export const buildArtefactFiles = (
  artefacts: Record<WindowId, WindowArtefacts>
): Record<string, string> => {
  const files: Record<string, string> = {};

  for (const window of WINDOW_IDS) {
    const { bestDecks, metaShare, matchupData } = artefacts[window];
    const payloads: Record<(typeof ARTEFACT_BASES)[number], unknown> = {
      "best-decks": bestDecks,
      "meta-share": metaShare,
      "matchup-data": matchupData,
    };
    for (const base of ARTEFACT_BASES) {
      files[`../public/data/${base}-${window}.json`] = JSON.stringify(
        payloads[base],
        null,
        2
      );
    }
  }

  for (const base of ARTEFACT_BASES) {
    files[`../public/data/${base}.json`] =
      files[`../public/data/${base}-${DEFAULT_WINDOW}.json`];
  }

  return files;
};
