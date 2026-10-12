import fs from "fs";
import { PipelinePartialDeck } from "../../../src/types/pipeline-data";
import {
  MAX_DATA_AGE_DAYS,
  MIN_PREVIOUS_ARCHETYPE_RATIO,
  MIN_PUBLISHED_ARCHETYPES,
  MIN_RANKED_ARCHETYPES,
} from "../settings";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface WindowSnapshot {
  id: string;
  bestDecks: readonly PipelinePartialDeck[];
  previousArchetypeCount: number | null;
}

export interface PublishCheckInput {
  windows: readonly WindowSnapshot[];
  defaultWindow: string;
  imageSlugs: readonly string[];
  deckSlugs: readonly string[];
  newestDeckDate: string | null;
  now: Date;
  currentSet: string | null;
  newestSet: string;
  currentSetListingCount: number;
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

const windowFailures = (window: WindowSnapshot, defaultWindow: string): string[] => {
  const failures: string[] = [];
  const total = window.bestDecks.length;
  const floor = MIN_PUBLISHED_ARCHETYPES[window.id];

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

  const images = new Set(input.imageSlugs);
  const decks = new Set(input.deckSlugs);
  const missing = [...decks].filter((slug) => !images.has(slug));
  const orphaned = [...images].filter((slug) => !decks.has(slug));
  if (missing.length > 0) failures.push(`${missing.length} decks have no image: ${missing.slice(0, 5).join(", ")}`);
  if (orphaned.length > 0) failures.push(`${orphaned.length} images have no deck: ${orphaned.slice(0, 5).join(", ")}`);

  if (input.currentSet !== input.newestSet) {
    failures.push(`listing store current set is ${input.currentSet ?? "unset"}, expected ${input.newestSet}`);
  }
  if (input.currentSetListingCount === 0) {
    failures.push(`listing store has no rows for ${input.newestSet}`);
  }

  return failures;
};

export const assertPublishable = (input: PublishCheckInput): void => {
  const failures = publishFailures(input);
  if (failures.length > 0) {
    throw new Error(`Refusing to publish:\n- ${failures.join("\n- ")}`);
  }
};
