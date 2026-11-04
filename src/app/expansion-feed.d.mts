type DeckCoverage = { lists?: readonly { score?: number; cards?: readonly unknown[] }[] };

export declare const bestListCards: (deck: DeckCoverage) => readonly unknown[];

export declare const bestListCardIds: (deck: DeckCoverage) => readonly string[];

export declare const coveredCardIdsBySet: (decks: readonly DeckCoverage[] | null) => ReadonlyMap<string, ReadonlySet<string>>;

export declare const coveredSetCodes: (decks: readonly DeckCoverage[] | null) => ReadonlySet<string>;

export declare const newestCoveredExpansion: <T extends { id: string; release_date: string | null }>(
  list: readonly T[] | null,
  decks: readonly DeckCoverage[] | null
) => T | null;
