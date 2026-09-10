// The pairing store's decision logic, kept apart from the scraper's network
// and file I/O so it can be tested without hitting Limitless.
import { cardKey } from "./set-codes";

// One pairing entry: a primary card and the data gathered about its partners.
export interface PairingEntry {
  secondary: string[];
  peakCountBySet: Record<string, number>;
  names: Record<string, number>;
}

// The pairing store: current set, last update, and every archetype's entry.
export interface PairingStore {
  updatedAt: string | null;
  currentSet: string | null;
  pairings: Record<string, PairingEntry>;
}

// A scraped deck after its slug has been resolved to real cards.
export interface ResolvedDeck {
  set: string;
  name: string;
  count: number;
  cards: { name: string; set: string; number: string }[];
}

// How a merge resolved: added a new primary, merged into an existing one, or left unresolved.
export type MergeOutcome = "added" | "merged" | "unresolved";

// Archetypes Limitless never lists, so the sweep cannot discover them; seeded because regeneration rebuilds the file.
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

// Merges a resolved deck into the store, folding partners onto the primary; returns whether it was added, merged, or unresolved.
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

// Ensures every seeded primary has an entry so regeneration keeps them present.
export const ensureSeeded = (store: PairingStore, primaries: readonly string[]): void => {
  for (const primary of primaries) {
    store.pairings[primary] ??= emptyEntry();
  }
};

// Serialises the pairings map to a stable string for change detection; same serializer the writer uses so key order is deterministic.
export const snapshot = (store: PairingStore): string =>
  JSON.stringify(store.pairings);

// Chooses the current set: only adopt a newly fetched set if we actually saw it, so a single timeout cannot regress currentSet and rename decks.
export const pickCurrentSet = (
  current: string | null,
  newest: string,
  fetchedSets: ReadonlySet<string>
): string | null => (fetchedSets.has(newest) ? newest : current);
