// The per-set Limitless deck listing store. Each set page is one snapshot of
// its own decks array; fetching a set REPLACES that array, so no data is lost
// by folding, and the matcher reads listings directly instead of inferring a
// primary/secondary graph.
import { NON_STANDARD_SET_CODES, STANDARD_SET_CODES } from "./set-codes";

// One row from a Limitless set page, exactly as the page shows it.
export interface DeckListing {
  name: string;
  slug: string;
  count: number;
}

// One set's snapshot.
export interface SetListing {
  decks: DeckListing[];
}

// The store: last update time, the newest standard set that was actually
// fetched, and every set's current snapshot.
export interface DeckListingStore {
  updatedAt: string | null;
  currentSet: string | null;
  sets: Record<string, SetListing>;
}

// Scrape order: standard sets oldest to newest, then the non-standard promo
// and reprint pools. The newest standard set is the current-format candidate.
export const SETS_SCRAPE_ORDER: readonly string[] = [
  ...STANDARD_SET_CODES,
  ...NON_STANDARD_SET_CODES,
];

const emptyStore = (): DeckListingStore => ({
  updatedAt: null,
  currentSet: null,
  sets: {},
});

// Reads the store from disk, or a fresh empty store when none exists.
export const readStore = (raw: string | null): DeckListingStore => {
  if (!raw) return emptyStore();
  const parsed = JSON.parse(raw) as Partial<DeckListingStore>;
  return {
    updatedAt: parsed.updatedAt ?? null,
    currentSet: parsed.currentSet ?? null,
    sets: parsed.sets ?? {},
  };
};

// Replaces one set's decks array with the freshly scraped page. Other sets are
// untouched, so a retry that only fetches some pages cannot blank the rest.
export const mergeSetPage = (
  store: DeckListingStore,
  set: string,
  decks: DeckListing[]
): void => {
  store.sets[set] = { decks };
};

// Chooses the current set: only adopt a newly fetched set if we actually saw
// it, so a single timeout cannot regress currentSet and rename decks.
export const pickCurrentSet = (
  current: string | null,
  newest: string,
  fetchedSets: ReadonlySet<string>
): string | null => (fetchedSets.has(newest) ? newest : current);

// Serialises the set snapshots to a stable string for change detection; the
// writer uses the same serializer so key order is deterministic.
export const snapshot = (store: DeckListingStore): string =>
  JSON.stringify(store.sets);
