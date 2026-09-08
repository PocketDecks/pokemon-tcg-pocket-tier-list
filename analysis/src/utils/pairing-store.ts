// The pairing store's decision logic, kept apart from the scraper's network
// and file I/O so it can be tested without hitting Limitless.
import { cardKey } from "./set-codes";

export interface PairingEntry {
  secondary: string[];
  peakCountBySet: Record<string, number>;
  names: Record<string, number>;
}

export interface PairingStore {
  updatedAt: string | null;
  currentSet: string | null;
  pairings: Record<string, PairingEntry>;
}

/** A scraped deck after its slug has been resolved to real cards. */
export interface ResolvedDeck {
  set: string;
  name: string;
  count: number;
  cards: { name: string; set: string; number: string }[];
}

export type MergeOutcome = "added" | "merged" | "unresolved";

// Archetypes Limitless never lists, so the sweep cannot discover them.
// Seeded because regeneration rebuilds the file from scratch.
export const SEED_PRIMARIES: readonly string[] = [
  "Oricorio A3 66",
  "Puppy-Loving Girl B3b 67",
  "Gigalith ex A2 94",
];

const emptyEntry = (): PairingEntry => ({
  secondary: [],
  peakCountBySet: {},
  names: {},
});

// The primary card identifies the archetype, so partners merge onto it
// instead of starting a second row. Nothing is ever pruned.
export const mergeDeck = (store: PairingStore, deck: ResolvedDeck): MergeOutcome => {
  if (!deck.cards.length) return "unresolved";

  const [primary, ...partners] = deck.cards.map((card) =>
    cardKey(card.name, card.set, card.number)
  );
  const seen = primary in store.pairings;
  if (!seen) store.pairings[primary] = emptyEntry();

  const entry = store.pairings[primary];
  for (const partner of partners) {
    if (!entry.secondary.includes(partner)) entry.secondary.push(partner);
  }

  const previousBest = entry.peakCountBySet[deck.set] ?? 0;
  if (deck.count > previousBest) entry.peakCountBySet[deck.set] = deck.count;
  entry.names[deck.name] = Math.max(entry.names[deck.name] ?? 0, deck.count);

  return seen ? "merged" : "added";
};

export const ensureSeeded = (store: PairingStore, primaries: readonly string[]): void => {
  for (const primary of primaries) {
    store.pairings[primary] ??= emptyEntry();
  }
};

// A fingerprint of everything the scrape can move, used to decide whether the
// file is worth rewriting: mergeDeck reports "merged" even for a row that did
// not change, so the tally cannot answer the question. updatedAt is excluded
// because it moves on every run by definition.
//
// This is deliberately the same serialiser that writes the file. mergeDeck
// only ever appends — new primaries, secondary.push, new set and name keys,
// none of them numeric — so JSON key order is deterministic and a string
// comparison is exact.
export const snapshot = (store: PairingStore): string =>
  JSON.stringify(store.pairings);

// currentSet is a property of the set list, not of any one HTTP response.
// Adopting "the newest set we happened to fetch" means a single timeout on
// the newest set's page regresses currentSet to the one before it, which
// changes what peakSum and isCurrentSetCard mean for every archetype and
// renames decks across the tier list until the next successful run.
export const pickCurrentSet = (
  current: string | null,
  newest: string,
  fetchedSets: ReadonlySet<string>
): string | null => (fetchedSets.has(newest) ? newest : current);
