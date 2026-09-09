import { Deck } from "./types";
import formatName from "./format-name";
import { cardKey, SET_CODES } from "./set-codes";
import listings from "../data/limitless-decks.json";
import { resolveSlug } from "./slug-cards";

// The store keeps one snapshot per set; a row is a candidate only if the deck
// holds every card the row lists, so the pairing is what Limitless shows, not
// an inferred primary/secondary split.
interface DeckListing {
  name: string;
  slug: string;
  count: number;
}
interface SetListing {
  decks: DeckListing[];
}
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
const getDeckName = (deck: Deck): string => {
  // A deck holds a card by its name, not its printing: a Magnezone A2 deck is
  // the same archetype Limitless lists as "Magnezone" in B1a, so reprints must
  // not split one pairing into separate buckets.
  const present = new Set(deck.cards.map((card) => card.name));

  // Candidate rows are those sharing at least one card name with the deck;
  // a row qualifies only when every card it lists is also in the deck. Ties are
  // broken first by how many cards the row names (a fuller listing wins, so
  // Charizard ex + Entei ex beats a lone Charizard ex row in a newer set), then
  // newest set, then higher count, then name order.
  const seen = new Set<number>();
  let best: { set: string; name: string; count: number; score: number; cards: string[] } | null = null;
  for (const cardName of present) {
    for (const index of rowsByCard.get(cardName) ?? []) {
      if (seen.has(index)) continue;
      seen.add(index);
      const row = ALL_ROWS[index];
      if (!row.cardNames.every((name) => present.has(name))) continue;
      const score = row.cardNames.length;
      if (
        !best ||
        score > best.score ||
        (score === best.score &&
          (orderOf(row.set) > orderOf(best.set) ||
            (orderOf(row.set) === orderOf(best.set) &&
              (row.count > best.count ||
                (row.count === best.count && row.name < best.name)))))
      ) {
        best = {
          set: row.set,
          name: row.name,
          count: row.count,
          score,
          cards: row.cardKeys,
        };
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
