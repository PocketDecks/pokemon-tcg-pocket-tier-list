// The single set-code enumeration behind the pairing key contract. Both sides
// of the language boundary fold a raw set code into one canonical form, so a
// pairing key is always "Name SET N" with SET one of the closed 23-value list.
// Promo and variant-letter casing collapse here so the scraper and the
// matcher cannot drift apart.

// Oldest to newest. The three trailing entries are not part of the current
// standard format: PA and PB are promo pools, and A4b is a deluxe reprint set
// whose cards fold onto their earliest earlier printing.
export const STANDARD_SET_CODES = [
  "A1", "A1a", "A2", "A2a", "A2b", "A3", "A3a", "A3b",
  "A4", "A4a", "B1", "B1a", "B2", "B2a", "B2b", "B3",
  "B3a", "B3b", "B4", "B4a",
] as const;

export const NON_STANDARD_SET_CODES = ["PA", "PB", "A4b"] as const;

export const SET_CODES: readonly string[] = [
  ...STANDARD_SET_CODES,
  ...NON_STANDARD_SET_CODES,
];

// Raw spelling -> canonical. Limitless writes promos as p-a / p-b in slugs
// and pa / pb in card data, and varies variant-letter casing freely, so every
// spelling that reaches us folds to one form here.
const CANONICAL = new Map<string, string>();
for (const code of SET_CODES) {
  CANONICAL.set(code.toLowerCase(), code);
}
CANONICAL.set("p-a", "PA");
CANONICAL.set("p-b", "PB");

// Longest-first, so a1a wins against a1 and p-a against pa. Generated rather
// than hand-ordered: the previous hand-maintained alternation had to be kept
// in this order by a comment.
export const SET_CODE_PATTERN = [...CANONICAL.keys()]
  .sort((a, b) => b.length - a.length || a.localeCompare(b))
  .join("|");

// A set code is one of a closed set of 23 values. An unrecognised one means
// the card data or a slug carries something this code has never seen, and
// folding it to upper case would bury that in a pairing key nothing can match.
export const canonSet = (raw: string): string => {
  const canonical = CANONICAL.get(String(raw).trim().toLowerCase());
  if (!canonical) throw new Error(`unknown set code: ${JSON.stringify(raw)}`);
  return canonical;
};

export const cardKey = (name: string, set: string, number: string): string =>
  `${name} ${canonSet(set)} ${number}`;
