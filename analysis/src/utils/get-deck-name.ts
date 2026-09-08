import cardToString from "./card-to-string";
import { Deck } from "./types";
import formatName from "./format-name";
import { cardKey, SET_CODES } from "./set-codes";
import pairings from "../data/limitless-pairings.json";
import cards from "pokemon-tcg-pocket-cards/data/v5/cards.min.json";

// The scoring lattice. Each weight outranks the next so a single higher-level
// signal always beats any lower one: sameLine beats anchored beats copies
// beats seeded beats reach (reach is a non-negative sum, so its floor is zero).
export const COPY_WEIGHT = 1e9;
export const SEEDED_BONUS = 5e8;
export const SAME_LINE_BONUS = 1e12;
export const ANCHORED_BONUS = 1e11;


interface PairingEntry {
  secondary: string[];
  peakCountBySet?: Record<string, number>;
  names?: Record<string, number>;
}
const PAIRINGS = (pairings as { pairings?: Record<string, PairingEntry> }).pairings ?? {};

// "Name SET NN" -> the card, for evolution lookups.
const cardByName = new Map(
  (cards as { name: string; set_code: string; id: string; evolves_from: string | null }[]).map(
    (c) => [
      cardKey(c.name, c.set_code, String(Number(c.id.split("-").pop()))),
      { name: c.name, evolvesFrom: c.evolves_from },
    ]
  )
);

// When both cards are two-ofs the centrepiece leads. An ex or Mega card
// outranks a plain one: Suicune ex leads Greninja.
const tierOf = (name: string): number => {
  if (/^Mega\s/i.test(name)) return 2;
  if (/\sex\b/i.test(name)) return 1;
  return 0;
};
// Built from the one set-code list, so a new set does not need this regex
// updated too. The previous literal was /A[1-4][ab]?|B[1-4][ab]?|PA|PB/, which
// would silently stop stripping the trailing code the day an A5 shipped —
// leaving the set code inside the species and breaking same-line comparison.
const SET_SUFFIX = new RegExp(`\\s+(?:${SET_CODES.join("|")})\\s+\\d+$`, "i");

const speciesOf = (name: string): string =>
  name
    .replace(SET_SUFFIX, "")
    .replace(/^Mega\s+/i, "")
    .replace(/\s+ex$/i, "")
    .trim();

// A card that a stronger card in the same deck evolves from is support, not
// the centrepiece. Without this a Magnezone deck gets named after Magneton.
const outclassed = (name: string, present: Set<string>): boolean => {
  const card = cardByName.get(name);
  if (!card) return false;
  return [...present].some(
    (other) => other !== name && cardByName.get(other)?.evolvesFrom === card.name
  );
};

// True when the deck also holds the base of this card's line, so the card is
// the top of a line the deck actually plays. A lone Basic tech card (Castform,
// Mantyke) tops nothing and must not outrank a real centrepiece. The chain is
// walked to the base because lists commonly skip the middle stage via Rare
// Candy, so checking only the immediate pre-evolution misses Torchic into
// Mega Blaziken ex.
// name -> what it evolves from, for walking a line down to its base.
const evolvesFromByName = new Map<string, string | null>();
for (const card of cardByName.values()) {
  evolvesFromByName.set(card.name, card.evolvesFrom);
}

const topsLine = (name: string, present: Set<string>): boolean => {
  const start = cardByName.get(name);
  if (!start?.evolvesFrom) return false;

  const presentNames = new Set<string>();
  for (const card of present) {
    const found = cardByName.get(card);
    if (found) presentNames.add(found.name);
  }

  let next: string | null | undefined = start.evolvesFrom;
  const seen = new Set<string>([start.name]);
  while (next) {
    if (presentNames.has(next)) return true;
    if (seen.has(next)) return false;
    seen.add(next);
    next = evolvesFromByName.get(next) ?? null;
  }
  return false;
};

// The scraper always writes currentSet; a store without it is corrupt and
// must fail loudly rather than silently vote across every set.
const currentSetRaw = (pairings as { currentSet?: string }).currentSet;
if (!currentSetRaw) {
  throw new Error("pairing store missing required currentSet");
}
const CURRENT_SET: string = currentSetRaw;

// Peak in the current set, falling back to the best set for cards the
// current set does not carry.
const peakSum = (name: string): number => {
  const entry = PAIRINGS[name];
  if (!entry?.peakCountBySet) return 0;
  const current = entry.peakCountBySet[CURRENT_SET];
  if (current !== undefined) return current;
  const peaks = Object.values(entry.peakCountBySet);
  return peaks.length ? Math.max(...peaks) : 0;
};

// Seeded because Limitless never lists them, so they carry no peak data.
// Reach must not be used against them, or any real partner outscores them
// and the archetype disappears from the tier list.
const isSeeded = (name: string): boolean => {
  const entry = PAIRINGS[name];
  if (!entry) return false;
  return !entry.peakCountBySet || Object.keys(entry.peakCountBySet).length === 0;
};

// Copy count dominates so a two-of centrepiece beats a one-of with a higher
// peak. Population only separates cards equally present in the deck.
const scorePair = (match: string[], countOf: (n: string) => number): number => {
  const copies = match.reduce((acc, name) => acc + countOf(name), 0);
  const reach = match.reduce((acc, name) => acc + peakSum(name), 0);
  // Below one card's worth of copies, above any reach, so a seeded archetype
  // wins against a partner at equal presence without overturning copy count.
  const seeded = match.some(isSeeded) ? SEEDED_BONUS : 0;
  return copies * COPY_WEIGHT + seeded + reach;
};

// How often this card appears as a secondary in other pairings. A card that
// is "someone else's partner" less often is the central archetype anchor,
// used to break ties between two ex cards (Mimikyu ex over Giratina ex).
const secondaryCount = (name: string): number => {
  let n = 0;
  for (const entry of Object.values(PAIRINGS)) {
    if (entry.secondary.includes(name)) n++;
  }
  return n;
};

// True only when the card's own set is the current one and it has a longer
// history behind it, so a current-set card leads an older card at equal
// presence: Team Rocket's Raticate ex (B4a) leads Alolan Ninetales ex (B2).
const isCurrentSetCard = (name: string): boolean => {
  const set = name.split(" ").slice(-2)[0];
  return set.toUpperCase() === CURRENT_SET.toUpperCase();
};

// The archetype's own line outranks an unrelated support card: a pair is
// same-species when both cards are the same species, or one evolves from it.
const isSameLine = (a: string, b: string): boolean => {
  if (speciesOf(a) === speciesOf(b)) return true;
  const [card, other] = [cardByName.get(a), cardByName.get(b)];
  return !!card && !!other && (card.evolvesFrom === other.name || other.evolvesFrom === card.name);
};

const matchPairing = (cards: Deck["cards"]): string[] | null => {
  const cardStrings = new Set(cards.map((card) => cardToString(card)));
  const countOf = (name: string) => {
    if (cardStrings.has(`2 ${name}`)) return 2;
    return cardStrings.has(`1 ${name}`) ? 1 : 0;
  };

  let best: string[] | null = null;
  let bestScore = -1;
  let bestKey: string | null = null;

  // Every card in the deck, not only the ones the pairing file happens to
  // mention. An evolution line the file never lists (Bulbasaur into Ivysaur)
  // still has to be visible, or the basic gets named as the centrepiece.
  const present = new Set<string>();
  for (const card of cards) {
    present.add(cardToString(card).replace(/^\d+ /, ""));
  }
  for (const [key, entry] of Object.entries(PAIRINGS)) {
    if (!countOf(key)) continue;
    present.add(key);
    for (const partner of entry.secondary) if (countOf(partner)) present.add(partner);
  }

  for (const [key, entry] of Object.entries(PAIRINGS)) {
    if (!countOf(key) || outclassed(key, present)) continue;

    // A partner can list several printings (Dustox B4 5 and Dustox B1 7).
    // Take the printing the deck actually holds, so the name does not mix
    // set codes across decks running the same pairing.
    const candidates: string[][] = [[key]];
    const keySpecies = speciesOf(key);
    for (const partner of entry.secondary) {
      if (outclassed(partner, present)) continue;
      // A slug can resolve to the same card twice (Dialga ex and Dialga ex),
      // which would name a deck after one card repeated.
      if (partner === key) continue;
      if (countOf(partner) >= 2) candidates.push([key, partner]);
      else if (countOf(partner) > 0 && speciesOf(partner) === keySpecies) {
        candidates.push([key, partner]);
      }
    }

    const deduped: string[][] = [];
    for (const match of candidates) {
      if (match.length < 2) {
        deduped.push(match);
        continue;
      }
      const species = speciesOf(match[1]);
      const inDeck = entry.secondary.filter(
        (p) => speciesOf(p) === species && countOf(p) > 0
      );
      if (inDeck.length > 1) {
        // Several printings of the same partner are in the deck; keep the
        // one Limitless ranks highest so the choice is stable.
        const picked = inDeck.sort((a, b) => peakSum(b) - peakSum(a))[0];
        deduped.push(match[1] === picked ? match : [match[0], picked]);
      } else {
        deduped.push(match);
      }
    }

    for (const match of deduped) {
      // A pair from the archetype's own line beats a bigger unrelated pair,
      // so Oricorio does not outrank the Magnezone split it supports.
      const sameLine = match.length > 1 && isSameLine(match[0], match[1]) ? SAME_LINE_BONUS : 0;
      // A card topping a line the deck plays outranks a lone Basic tech card,
      // so Castform does not take the name from Mega Blaziken ex and Mantyke
      // does not take it from Mega Sharpedo ex.
      const anchored =
        match.some((card) => topsLine(card, present)) &&
        !match.some((card) => countOf(card) > 0 && !topsLine(card, present) && !cardByName.get(card)?.evolvesFrom)
          ? ANCHORED_BONUS
          : 0;
      const score = scorePair(match, countOf) + sameLine + anchored;
      if (score > bestScore) {
        bestScore = score;
        best = match;
        bestKey = key;
      } else if (score === bestScore && best) {
        const ordered = [...match].sort((a, b) => a.localeCompare(b)).join("&");
        const bestOrdered = [...best].sort((a, b) => a.localeCompare(b)).join("&");
        if (ordered < bestOrdered) {
          best = match;
          bestKey = key;
        }
      }
    }
  }

  // The centrepiece leads. Both being two-ofs means the pairing's own key
  // decides, since that is the archetype as Limitless lists it. Otherwise the
  // card played in more copies leads, then popularity, then name.
  if (best && best.length > 1) {
    best = [...best].sort((a, b) => {
      const byCopies = countOf(b) - countOf(a);
      if (byCopies !== 0) return byCopies;
      // The centrepiece leads: an ex or Mega outranks a plain card when both
      // are played as two-ofs, even if the pairing key points the other way.
      const byTier = tierOf(b) - tierOf(a);
      if (byTier !== 0) return byTier;
      // A card from the current set leads an older card at equal presence.
      // Team Rocket's Raticate ex (B4a) leads Alolan Ninetales ex (B2).
      const byCurrency =
        (isCurrentSetCard(b) ? 1 : 0) - (isCurrentSetCard(a) ? 1 : 0);
      if (byCurrency !== 0) return byCurrency;
      // Which pairing produced the match settles cards that are otherwise
      // equal. Both cards can list each other, and then the first key in the
      // pairing file wins, so this tiebreak depends on file order.
      if (bestKey === b) return 1;
      if (bestKey === a) return -1;
      // The card named as a partner more often leads, so the more widely
      // splashed card comes first: Giratina ex (108) ahead of Mimikyu ex (23).
      const byLead = secondaryCount(a) - secondaryCount(b);
      if (byLead !== 0) return byLead;
      const byReach = peakSum(b) - peakSum(a);
      return byReach !== 0 ? byReach : a.localeCompare(b);
    });
  }

  return best;
};

/**
 * Attempts to find a matching deck name based on the deck's cards
 * @param deck The deck to find a name for
 * @returns The formatted deck name if found, null otherwise
 */
const getDeckName = (deck: Deck): string | null => {
  const { cards } = deck;

  const scraped = matchPairing(cards);
  if (scraped) return formatName(cards, scraped);
  return "professor's-research-pa-007";
};

export default getDeckName;
