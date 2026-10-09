export declare const DELUXE_EXPANSION_IDS: ReadonlySet<string>;
export declare const isListedExpansion: (expansion: { id: string }) => boolean;
export declare const newestExpansion: <T extends { id: string; release_date: string | null }>(
  list: readonly T[]
) => T | null;
