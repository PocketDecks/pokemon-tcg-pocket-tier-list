export declare const coveredCardIdsBySet: (
  decks: readonly { lists?: readonly { cards?: readonly unknown[] }[] }[] | null
) => ReadonlyMap<string, ReadonlySet<string>>;

export declare const coveredSetCodes: (
  decks: readonly { lists?: readonly { cards?: readonly unknown[] }[] }[] | null
) => ReadonlySet<string>;

export declare const newestCoveredExpansion: <T extends { id: string; release_date: string | null }>(
  list: readonly T[] | null,
  decks: readonly { lists?: readonly { cards?: readonly unknown[] }[] }[] | null
) => T | null;
