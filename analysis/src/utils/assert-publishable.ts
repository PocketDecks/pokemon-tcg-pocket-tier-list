import fs from "fs";
import { PipelinePartialDeck } from "../../../src/types/pipeline-data";
import {
  MAX_DATA_AGE_DAYS,
  MIN_PREVIOUS_ARCHETYPE_RATIO,
  MIN_PUBLISHED_ARCHETYPES,
  MIN_RANKED_ARCHETYPES,
} from "../settings";
import type { WindowId } from "./build-window-artefacts";

const DAY_MS = 24 * 60 * 60 * 1000;

// Share of the default window's qualified games the unmatched bucket may carry
// before a run is refused. Decks that pair with no listing are a data gap, not
// a meta shift, so a run where they grow past this is not published.
export const MAX_UNMATCHED_DECK_SHARE: number = 0.25;

export interface WindowSnapshot {
  id: string;
  bestDecks: readonly PipelinePartialDeck[];
  previousArchetypeCount: number | null;
}

export interface UnmatchedDeckSnapshot {
  decks: number;
  games: number;
  qualifiedGames: number;
}

export interface PublishCheckInput {
  windows: readonly WindowSnapshot[];
  defaultWindow: string;
  deckSlugs: readonly string[];
  newestDeckDate: string | null;
  now: Date;
  currentSet: string | null;
  newestSet: string;
  currentSetListingCount: number;
  unmatchedDecks: UnmatchedDeckSnapshot;
}

export const newestDeckDate = (decks: readonly { date: string }[]): string | null =>
  decks.reduce<string | null>(
    (newest, deck) =>
      newest === null || new Date(deck.date) > new Date(newest) ? deck.date : newest,
    null
  );

export const readArchetypeCount = (file: string): number | null => {
  if (!fs.existsSync(file)) return null;
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(parsed) ? parsed.length : null;
  } catch {
    return null;
  }
};

const readGeneratedAt = (file: string): number | null => {
  if (!fs.existsSync(file)) return null;
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
    const value = (parsed as { generatedAt?: unknown } | null)?.generatedAt;
    const time = typeof value === "string" ? Date.parse(value) : Number.NaN;
    return Number.isNaN(time) ? null : time;
  } catch {
    return null;
  }
};

// A publish from an earlier expansion says nothing about whether this
// expansion's data is thin, so only a publish from this one is compared.
export const readPreviousArchetypeCount = (
  bestDecksFile: string,
  metaShareFile: string,
  release: Date
): number | null => {
  const generatedAt = readGeneratedAt(metaShareFile);
  if (generatedAt === null || generatedAt < release.getTime()) return null;
  return readArchetypeCount(bestDecksFile);
};

const isWindowId = (id: string): id is WindowId =>
  Object.prototype.hasOwnProperty.call(MIN_PUBLISHED_ARCHETYPES, id);

const windowFailures = (window: WindowSnapshot, defaultWindow: string): string[] => {
  const failures: string[] = [];
  const total = window.bestDecks.length;
  const floor = isWindowId(window.id) ? MIN_PUBLISHED_ARCHETYPES[window.id] : undefined;

  if (floor === undefined) {
    failures.push(`${window.id}: no archetype floor is configured for this window`);
  } else if (total < floor) {
    failures.push(`${window.id}: only ${total} archetypes, the floor is ${floor}`);
  }

  if (
    window.previousArchetypeCount !== null &&
    total < window.previousArchetypeCount * MIN_PREVIOUS_ARCHETYPE_RATIO
  ) {
    failures.push(
      `${window.id}: ${total} archetypes is under ${MIN_PREVIOUS_ARCHETYPE_RATIO * 100}% of the previous ${window.previousArchetypeCount}`
    );
  }

  if (window.id === defaultWindow) {
    const ranked = window.bestDecks.filter((deck) => deck.powerScore !== null).length;
    if (ranked < MIN_RANKED_ARCHETYPES) {
      failures.push(
        `${window.id}: only ${ranked} archetypes have a Power Score, the floor is ${MIN_RANKED_ARCHETYPES}`
      );
    }
  }

  return failures;
};

export const publishFailures = (input: PublishCheckInput): string[] => {
  const failures: string[] = [];

  if (!input.windows.some((window) => window.id === input.defaultWindow)) {
    failures.push(`default window ${input.defaultWindow} is missing`);
  }
  for (const window of input.windows) {
    failures.push(...windowFailures(window, input.defaultWindow));
  }

  if (input.newestDeckDate === null) {
    failures.push("no qualified decks to date the data");
  } else {
    const ageDays = (input.now.getTime() - new Date(input.newestDeckDate).getTime()) / DAY_MS;
    if (ageDays > MAX_DATA_AGE_DAYS) {
      failures.push(
        `newest deck is ${ageDays.toFixed(1)} days old, the limit is ${MAX_DATA_AGE_DAYS}`
      );
    }
  }

  const repeated = input.deckSlugs.filter(
    (slug, index) => input.deckSlugs.indexOf(slug) !== index
  );
  if (repeated.length > 0) {
    failures.push(`${repeated.length} decks share a slug: ${[...new Set(repeated)].slice(0, 5).join(", ")}`);
  }

  if (input.currentSet !== input.newestSet) {
    failures.push(`listing store current set is ${input.currentSet ?? "unset"}, expected ${input.newestSet}`);
  }
  if (input.currentSetListingCount === 0) {
    failures.push(`listing store has no rows for ${input.newestSet}`);
  }

  // A swollen bucket means decks stopped matching their listing, which is the
  // signal that the pairing store missed something rather than that the meta
  // changed.
  const unmatched = input.unmatchedDecks;
  const unmatchedShare =
    unmatched.qualifiedGames > 0 ? unmatched.games / unmatched.qualifiedGames : 0;
  if (unmatchedShare > MAX_UNMATCHED_DECK_SHARE) {
    failures.push(
      `${unmatched.decks} decks matched no listing, ${(unmatchedShare * 100).toFixed(1)}% of the qualified games in ${input.defaultWindow}, the limit is ${MAX_UNMATCHED_DECK_SHARE * 100}%`
    );
  }

  return failures;
};

export const assertPublishable = (input: PublishCheckInput): void => {
  const failures = publishFailures(input);
  if (failures.length > 0) {
    throw new Error(`Refusing to publish:\n- ${failures.join("\n- ")}`);
  }
};
