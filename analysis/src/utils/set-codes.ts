// The single set-code enumeration behind the pairing key contract. Both sides
// of the language boundary fold a raw set code into one canonical form, so a
// pairing key is always "Name SET N" with SET one of the closed 23-value list.
// Promo and variant-letter casing collapse here so the scraper and the
// matcher cannot drift apart.

// Set codes in the current standard format, oldest to newest. PA/PB are promo pools and A4b a reprint set whose cards fold onto an earlier printing.
export const STANDARD_SET_CODES = [
  "A1", "A1a", "A2", "A2a", "A2b", "A3", "A3a", "A3b",
  "A4", "A4a", "B1", "B1a", "B2", "B2a", "B2b", "B3",
  "B3a", "B3b", "B4", "B4a",
] as const;

// Set codes outside the standard format (promo pools and the A4b reprint).
export const NON_STANDARD_SET_CODES = ["PA", "PB", "A4b"] as const;

// Every set code, standard and non-standard.
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

// Regex alternation of every set code, longest-first so a1a beats a1; generated rather than hand-ordered.
export const SET_CODE_PATTERN = [...CANONICAL.keys()]
  .sort((a, b) => b.length - a.length || a.localeCompare(b))
  .join("|");

// Folds a raw set code to its canonical form, throwing on anything the closed list does not recognise.
export const canonSet = (raw: string): string => {
  const canonical = CANONICAL.get(String(raw).trim().toLowerCase());
  if (!canonical) throw new Error(`unknown set code: ${JSON.stringify(raw)}`);
  return canonical;
};

// Builds the canonical pairing key "Name SET N" from a card's name, set, and number.
export const cardKey = (name: string, set: string, number: string): string =>
  `${name} ${canonSet(set)} ${number}`;
