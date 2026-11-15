import {
  PipelineMatchupData,
  PipelinePartialDeck,
} from "../../../src/types/pipeline-data";
import { buildDeckPower, DeckPowerInput } from "./build-deck-power";
import { buildMatchupPopulations } from "./build-matchup-populations";
import { buildMetaShare, WindowMetaShare } from "./build-meta-share";
import { calculateCardScores } from "./calculate-card-scores";
import { calculateDeckScore } from "./calculate-deck-score";
import { convertCardsToIds } from "./convert-cards";
import { isUnmatchedDeck } from "./get-deck-name";
import getId from "./get-id";
import { tallyCards } from "./tally-cards";
import { Deck } from "./types";
import {
  DEFAULT_WINDOW,
  WINDOW_IDS,
  WINDOW_LENGTH_DAYS,
  type WindowId,
} from "../../../src/types/meta-windows";
import {
  MIN_ARCHETYPE_QUALIFIED_GAMES,
  MIN_WINRATE_THRESHOLD,
  ScoringWeights,
  scoringWeights,
} from "../settings";

export { DEFAULT_WINDOW, WINDOW_IDS, WINDOW_LENGTH_DAYS };
export type { WindowId };

const DAY_MS = 24 * 60 * 60 * 1000;

const dayKey = (date: string) => date.split("T")[0];

export interface WindowArtefacts {
  bestDecks: PipelinePartialDeck[];
  metaShare: WindowMetaShare;
  matchupData: PipelineMatchupData;
}

// Windows anchor on the newest data date, not the run clock, so a refresh
// that lands days after the last scrape still fills its window.
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

export const latestAnchor = (decks: Deck[], fallback: Date): Date => {
  const newestKey = decks.reduce((newest, deck) => {
    const key = dayKey(deck.date);
    return key > newest ? key : newest;
  }, "");
  return new Date(`${newestKey || dayKey(fallback.toISOString())}T00:00:00Z`);
};

const isQualified = (deck: Deck): boolean =>
  deck.totalGames > 0 && deck.winCount / deck.totalGames >= MIN_WINRATE_THRESHOLD;

export interface WindowDecks {
  inWindow: Deck[];
  qualified: Deck[];
}

// The store's decks, the newest data date every window anchors on, and each
// window's decks, computed once per run. `today` is the run clock: it stamps
// generated files and stands in for the anchor when the store is empty.
export interface DeckPopulation {
  today: Date;
  anchor: Date;
  windows: Record<WindowId, WindowDecks>;
}

export const buildDeckPopulation = (decks: Deck[], today: Date): DeckPopulation => {
  const anchor = latestAnchor(decks, today);
  const windows = Object.fromEntries(
    WINDOW_IDS.map((window) => {
      const inWindow = decksInWindow(decks, window, anchor);
      return [window, { inWindow, qualified: inWindow.filter(isQualified) }];
    })
  ) as Record<WindowId, WindowDecks>;
  return { today, anchor, windows };
};

export interface UnmatchedDecks {
  decks: number;
  games: number;
}

// How many qualified decks matched no listing, and the games they carry.
// Reported on every run so a rise in the bucket is visible.
export const unmatchedDecksIn = (qualified: Deck[]): UnmatchedDecks => {
  const unmatched = qualified.filter((deck) => isUnmatchedDeck(deck.name));
  return {
    decks: unmatched.length,
    games: unmatched.reduce((sum, deck) => sum + deck.totalGames, 0),
  };
};

type PowerFields = "expectedWinRate" | "fieldCoverage" | "powerScore" | "freqScore" | "metaScore";
type RankedDeck = Omit<PipelinePartialDeck, PowerFields>;

const rankDecks = (
  qualifiedDecks: Deck[],
  weights: ScoringWeights
): { rankedDecks: RankedDeck[]; rankedNames: string[] } => {
  const totalQualifiedGames = qualifiedDecks.reduce(
    (sum, deck) => sum + deck.totalGames,
    0
  );

  const gamesByName = new Map<string, number>();
  for (const deck of qualifiedDecks) {
    gamesByName.set(deck.name, (gamesByName.get(deck.name) ?? 0) + deck.totalGames);
  }
  const rankedNames = [...new Set(qualifiedDecks.map((deck) => deck.name))].filter(
    (name) => (gamesByName.get(name) ?? 0) >= MIN_ARCHETYPE_QUALIFIED_GAMES
  );

  const rankedDecks: RankedDeck[] = [];
  const idExists: Record<string, boolean> = {};

  for (const name of rankedNames) {
    const matching = qualifiedDecks.filter((deck) => deck.name === name);
    const matchingGames = matching.reduce((sum, deck) => sum + deck.totalGames, 0);

    const scoredCards = calculateCardScores(
      tallyCards(matching),
      matchingGames,
      weights
    );

    const lists = [];
    for (const deck of matching) {
      const id = getId(deck);
      if (idExists[id]) continue;
      const deckScore = calculateDeckScore(
        deck,
        scoredCards,
        matchingGames,
        totalQualifiedGames,
        weights
      );
      lists.push({
        cards: convertCardsToIds(deck.cards),
        score: deckScore.score,
        strength: deckScore.strength,
      });
      idExists[id] = true;
    }

    const share = matchingGames / totalQualifiedGames;
    rankedDecks.push({
      name,
      lists,
      popularity: share,
      percentOfGames: share,
      score: lists.length ? Math.max(...lists.map((list) => list.score)) : 0,
    });
  }

  rankedDecks.sort((a, b) => b.score - a.score);
  return { rankedDecks, rankedNames };
};

// Every in-window game counts once; only the window choice changes which
// games contribute. Pure, so tests drive it without a scrape.
export const buildWindowArtefacts = (
  population: DeckPopulation,
  window: WindowId
): WindowArtefacts => {
  const { today, anchor } = population;
  const { inWindow, qualified } = population.windows[window];
  const { rankedDecks, rankedNames } = rankDecks(qualified, scoringWeights(anchor));

  const shareDays = WINDOW_LENGTH_DAYS[window];
  const metaShare = buildMetaShare(
    population.windows.all.qualified,
    rankedDecks,
    today,
    { shareDays, gamesDays: shareDays, anchor }
  );

  // Public rows count every player in the window; Power Score reads the
  // qualified tally matching the field shares it weights by. The ranked field
  // keeps the unmatched bucket, so its games stay in the denominator every
  // archetype's shares and coverage are measured against.
  const { publicMatchupData, powerMatchupData } = buildMatchupPopulations(
    inWindow,
    qualified,
    rankedNames
  );

  const gamesByName = new Map(
    metaShare.decks.map((entry) => [entry.name, entry.windowGames])
  );
  const powerInputs: DeckPowerInput[] = rankedDecks.map((deck) => ({
    name: deck.name,
    matchups: powerMatchupData[deck.name] ?? [],
    windowGames: gamesByName.get(deck.name) ?? 0,
  }));
  const powerByName = new Map(
    buildDeckPower(powerInputs).map((row) => [row.name, row] as const)
  );
  const scoredDecks: PipelinePartialDeck[] = rankedDecks.map((deck) => {
    const power = powerByName.get(deck.name);
    return {
      ...deck,
      expectedWinRate: power?.expectedWinRate ?? 0.5,
      fieldCoverage: power?.fieldCoverage ?? 0,
      powerScore: power?.powerScore ?? null,
      freqScore: power?.freqScore ?? 0,
      metaScore: power?.metaScore ?? null,
    };
  });

  // The bucket is scored with the field so the shares above count its games,
  // then dropped from every published row: a deck that matched no listing is
  // not an archetype, so it carries no ranking row, no movement row and no
  // matchup table of its own. Its games survive as opponent rows in the
  // tallies above, where the decks it played still name it.
  return {
    bestDecks: scoredDecks.filter((deck) => !isUnmatchedDeck(deck.name)),
    metaShare: {
      ...metaShare,
      decks: metaShare.decks.filter((entry) => !isUnmatchedDeck(entry.name)),
    },
    matchupData: Object.fromEntries(
      Object.entries(publicMatchupData).filter(([name]) => !isUnmatchedDeck(name))
    ),
  };
};
