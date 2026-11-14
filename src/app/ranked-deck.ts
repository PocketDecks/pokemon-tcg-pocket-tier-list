export interface PowerScored {
  powerScore: number | null;
}

export type RankedDeck<T extends PowerScored> = T & { powerScore: number };

export const isRanked = <T extends PowerScored>(deck: T): deck is RankedDeck<T> =>
  deck.powerScore !== null;

export const rankedDecks = <T extends PowerScored>(decks: readonly T[]): RankedDeck<T>[] =>
  decks.filter(isRanked);

export const sortRanked = <T extends PowerScored>(decks: readonly RankedDeck<T>[]): RankedDeck<T>[] =>
  [...decks].sort((a, b) => b.powerScore - a.powerScore);

// An unranked deck has no Power score. -1 sinks it below every ranked deck
// instead of letting a null read as 0, which would place it level with the
// genuinely worst-performing decks.
export const UNRANKED_SORT_VALUE = -1;

export const comparePowerDescending = (a: PowerScored, b: PowerScored): number =>
  (b.powerScore ?? UNRANKED_SORT_VALUE) - (a.powerScore ?? UNRANKED_SORT_VALUE);
