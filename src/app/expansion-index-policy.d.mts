type ExpansionIndexEntry = { id: string; release_date: string | null };

type DeckCoverage = { lists?: readonly { cards?: readonly unknown[] }[] };

export declare const MIN_INDEXED_EXPANSION_CARDS: number;

export declare const expansionIndexPolicy: <T extends ExpansionIndexEntry>(
  expansions: readonly T[],
  decks: readonly DeckCoverage[] | null
) => {
  newest: T | null;
  previous: T | null;
  isIndexable: (id: string) => boolean;
};
