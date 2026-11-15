/**
 * The pipeline emits a card-plus-copies reference in two shapes: deck lists use
 * "2:a1-004", card scores use "2 A1 004". One parser each, both landing on the
 * same result, so callers never split these strings themselves.
 */
export interface CardRef {
  id: string;
  count: number;
  set: string;
}

/** Promo sets carry a hyphen the card ids drop. */
export const setCode = (set: string): string => set.toLowerCase().replace(/^p-(?=[a-z]$)/, "p");

/** "2:a1-004" from best-decks.json. */
export const parseDeckListRef = (ref: string): CardRef => {
  const [count, id] = ref.split(":");
  return {
    id,
    count: parseInt(count),
    set: id ? id.split("-")[0] : "",
  };
};

/** "2 A1 004" from card-scores.json, where the number may need padding. */
export const parseScoreRef = (ref: string): CardRef => {
  const parts = ref.split(" ");
  const set = setCode(parts[parts.length - 2]);
  return {
    id: `${set}-${parts[parts.length - 1].padStart(3, "0")}`,
    count: parseInt(parts[0] ?? "0"),
    set,
  };
};
