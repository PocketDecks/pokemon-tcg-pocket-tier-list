import { Deck } from "./types";
import formatName from "./format-name";
import { cardKey, SET_CODES } from "./set-codes";
import listings from "../data/limitless-decks.json";
import { resolveSlug } from "./slug-cards";
import { SetListing } from "./deck-listing-store";
import cardsJson from "pokemon-tcg-pocket-cards/data/v5/cards.min.json";

// The store keeps one snapshot per set; a row is a candidate only if the deck
// holds every card the row lists, so the pairing is what Limitless shows, not
// an inferred primary/secondary split.
const STORE = listings as { sets: Record<string, SetListing> };

// Set age for the tiebreak: standard sets oldest to newest, then the
// non-standard pools. A higher index is the newer format.
const SET_ORDER = new Map(SET_CODES.map((set, index) => [set.toUpperCase(), index]));
const orderOf = (set: string): number =>
  SET_ORDER.get(set.toUpperCase()) ?? -1;

// Archetypes Limitless never lists, so no row will ever match them; seeded so
// regeneration still names them. The display pair is what formatName renders
// when the deck holds the primary and no listing row matched.
interface SeededArchetype {
  primary: string;
  display: string[];
}
const SEEDED_ARCHETYPES: readonly SeededArchetype[] = [
  { primary: "Oricorio", display: ["Oricorio A3 66"] },
  { primary: "Puppy-Loving Girl", display: ["Puppy-Loving Girl B3b 67"] },
  { primary: "Gigalith ex", display: ["Gigalith ex A2 94"] },
];

// Slug shared by all decks that match no listing, so the tier list has one
// "everything else" bucket.
export const UNNAMED_DECK = "professor's-research-pa-007";

// One resolved listing row, with its card names for subset matching.
interface IndexedRow {
  set: string;
  name: string;
  count: number;
  cardNames: string[];
  cardKeys: string[];
}

// Built once at import: rows grouped by each card name they contain, so a deck
// only evaluates rows that share at least one of its cards instead of scanning
// every row.
const ALL_ROWS: IndexedRow[] = [];
const rowsByCard: Map<string, number[]> = new Map();
for (const [set, listing] of Object.entries(STORE.sets)) {
  for (const row of listing.decks) {
    const cards = resolveSlug(row.slug).map((c) =>
      cardKey(c.name, c.set, c.number)
    );
    if (!cards.length) continue;
    const cardNames = cards.map((key) => key.split(" ").slice(0, -2).join(" "));
    const index = ALL_ROWS.length;
    ALL_ROWS.push({ set, name: row.name, count: row.count, cardNames, cardKeys: cards });
    for (const cardName of cardNames) {
      const refs = rowsByCard.get(cardName);
      if (refs) refs.push(index);
      else rowsByCard.set(cardName, [index]);
    }
  }
}

// Resolves a deck's card list to a Limitless listing name, or UNNAMED_DECK
// when nothing matches and no seeded archetype applies.

// name -> what it evolves from, so a row's pair can be checked for a shared
// line. A deck containing Igglybuff (a 2-of tech Basic) also contains the
// deck's real centrepiece, so containment alone matches junk rows like
// "Espeon Igglybuff" against a Mega Altaria ex Espeon deck. A row's partner
// must be a 2-of in the deck, share a line with the lead, or be a centrepiece
// itself: a card that tops an evolution line the deck plays, as Mega Altaria
// ex and Espeon both do in a Swablu/Eevee deck.
const evolvesFromByName = new Map<string, string | null>(
  (
    cardsJson as {
      name: string;
      set_code: string;
      id: string;
      evolves_from: string | null;
    }[]
  ).map((c) => [c.name, c.evolves_from])
);

const speciesOf = (name: string): string =>
  name
    .replace(/^Mega\s+/i, "")
    .replace(/\s+ex$/i, "")
    .trim();

const isSameLine = (a: string, b: string): boolean => {
  if (speciesOf(a) === speciesOf(b)) return true;
  return (
    evolvesFromByName.get(a) === b ||
    evolvesFromByName.get(b) === a
  );
};

// Walks the card's line down to its base: lists commonly skip middle stages
// via Rare Candy, so checking only the immediate pre-evolution misses
// Torchic into Mega Blaziken ex.
const topsLine = (name: string, presentNames: Set<string>): boolean => {
  const startsAt = evolvesFromByName.get(name);
  if (!startsAt) return false;
  const seen = new Set<string>([name]);
  let next: string | null | undefined = startsAt;
  while (next) {
    if (presentNames.has(next)) return true;
    if (seen.has(next)) return false;
    seen.add(next);
    next = evolvesFromByName.get(next) ?? null;
  }
  return false;
};

// Negative when `a` ranks higher, matching Array.prototype.sort's convention.
// Numeric only: the name tiebreak is applied separately, so this needs no
// runtime type dispatch and no casts.
const compareRank = (a: readonly number[], b: readonly number[]): number => {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return b[i] - a[i];
  }
  return 0;
};

// True when the deck also holds a card that evolves from this one, so the
// card is a line's support stage, not the centrepiece. Without this a
// Magnezone deck gets named after Magneton.
const outclassed = (name: string, presentNames: Set<string>): boolean => {
  for (const other of presentNames) {
    if (other !== name && evolvesFromByName.get(other) === name) return true;
  }
  return false;
};

const getDeckName = (deck: Deck): string => {
  // A deck holds a card by its name, not its printing: a Magnezone A2 deck is
  // the same archetype Limitless lists as "Magnezone" in B1a, so reprints must
  // not split one pairing into separate buckets.
  const present = new Set(deck.cards.map((card) => card.name));
  const countOf = (name: string): number =>
    deck.cards.find((card) => card.name === name)?.count ?? 0;

  // Candidate rows are those sharing at least one card name with the deck;
  // a row qualifies only when every card it lists is also in the deck. Rows
  // are ranked by the tuple below, first difference deciding:
  //   cards     how many cards the row names (a fuller listing wins, so
  //             Mega Rayquaza ex + Dragonair beats a lone Dragonair row)
  //   sameLine  two cards of the row share a species or evolution line
  //   anchored  a card tops a line the deck plays and no row member is a plain
  //             tech Basic - this is what kept Igglybuff or Mantyke from
  //             naming decks. `sameLine` and `anchored` only separate rows of
  //             equal length: ranked above `cards` they strip centrepieces.
  //   set       newer set
  //   count     higher Limitless count
  // A full tie falls through to lexicographic row name, applied below.
  type RowRank = readonly [cards: number, sameLine: number, anchored: number, set: number, count: number];
  const seen = new Set<number>();
  let best: { rank: RowRank; cards: string[]; name: string } | null = null;
  for (const cardName of present) {
    for (const index of rowsByCard.get(cardName) ?? []) {
      if (seen.has(index)) continue;
      seen.add(index);
      const row = ALL_ROWS[index];
      // A line's middle stage must not anchor a row: with Magnezone in the
      // deck, Magneton cannot lead the name.
      if (outclassed(row.cardNames[0], present)) continue;
      // supportedNames drops names the deck outclasses so they do not drive
      // sameLine, anchored or the row length; the containment check below is
      // separate and validates every name the row lists against the deck, so a
      // row cannot name a card the deck does not play.
      const supportedNames = row.cardNames.filter(
        (name) => !outclassed(name, present)
      );
      if (!row.cardNames.every((name) => present.has(name))) continue;
      const sameLine =
        supportedNames.length > 1 && isSameLine(supportedNames[0], supportedNames[1])
          ? 1
          : 0;
      const anchored =
        supportedNames.some((name) => topsLine(name, present)) &&
        !supportedNames.some(
          (name) =>
            countOf(name) > 0 &&
            !topsLine(name, present) &&
            evolvesFromByName.get(name) == null
        )
          ? 1
          : 0;
      const rank: RowRank = [
        supportedNames.length,
        sameLine,
        anchored,
        orderOf(row.set),
        row.count,
      ];
      if (!best) {
        best = { rank, cards: row.cardKeys, name: row.name };
        continue;
      }
      const order = compareRank(rank, best.rank);
      if (order < 0 || (order === 0 && row.name < best.name)) {
        best = { rank, cards: row.cardKeys, name: row.name };
      }
    }
  }

  if (best) return formatName(deck.cards, best.cards);

  // No listing matched: a seeded archetype still names the deck when its
  // primary is present, so those decks are not lost to the unnamed bucket.
  for (const seed of SEEDED_ARCHETYPES) {
    if (present.has(seed.primary)) return formatName(deck.cards, seed.display);
  }

  return UNNAMED_DECK;
};

export default getDeckName;
