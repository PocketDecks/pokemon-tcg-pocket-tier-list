import cardToString from "./card-to-string";
import { Deck } from "./types";
import formatName from "./format-name";
import pairings from "../data/limitless-pairings.json";
import cards from "pokemon-tcg-pocket-cards/data/v5/cards.min.json";


interface PairingEntry {
  secondary: string[];
  peakCountBySet?: Record<string, number>;
  names?: Record<string, number>;
}
const PAIRINGS = (pairings as { pairings?: Record<string, PairingEntry> }).pairings ?? {};

// "Name SET NN" -> the card, for evolution lookups.
const cardByName = new Map(
  (cards as { name: string; set_code: string; id: string; evolves_from: string | null }[]).map(
    (c) => {
      const set = c.set_code.toUpperCase().replace("P-A", "PA").replace("P-B", "PB");
      const m = set.match(/^([AB]\d)([AB])$/);
      const code = m ? `${m[1]}${m[2].toLowerCase()}` : set;
      return [
        `${c.name} ${code} ${String(Number(c.id.split("-").pop()))}`,
        { name: c.name, evolvesFrom: c.evolves_from },
      ];
    }
  )
);

// When both cards are two-ofs the centrepiece leads. An ex or Mega card
// outranks a plain one: Suicune ex leads Greninja, Giratina ex leads Mimikyu.
const tierOf = (name: string): number => {
  if (/^Mega\s/i.test(name)) return 2;
  if (/\sex\b/i.test(name)) return 1;
  return 0;
};
const speciesOf = (name: string): string =>
  name
    .replace(/\s+(A[1-4][ab]?|B[1-4][ab]?|PA|PB)\s+\d+$/i, "")
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

const CURRENT_SET: string | null =
  (pairings as { currentSet?: string }).currentSet ??
  (() => {
    const counts = new Map<string, number>();
    for (const entry of Object.values(PAIRINGS)) {
      for (const [set, n] of Object.entries(entry.peakCountBySet ?? {})) {
        counts.set(set, (counts.get(set) ?? 0) + n);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  })();

// Peak in the current set, falling back to the best set for cards the
// current set does not carry.
const peakSum = (name: string): number => {
  const entry = PAIRINGS[name];
  if (!entry?.peakCountBySet) return 0;
  const current = CURRENT_SET ? entry.peakCountBySet[CURRENT_SET] : undefined;
  if (current !== undefined) return current;
  const peaks = Object.values(entry.peakCountBySet);
  return peaks.length ? Math.max(...peaks) : 0;
};

// Copy count dominates so a two-of centrepiece beats a one-of with a higher
// peak. Population only separates cards equally present in the deck.
const scorePair = (match: string[], countOf: (n: string) => number): number => {
  const copies = match.reduce((acc, name) => acc + countOf(name), 0);
  const reach = match.reduce((acc, name) => acc + peakSum(name), 0);
  return copies * 1e9 + reach;
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

  const present = new Set<string>();
  for (const [key, entry] of Object.entries(PAIRINGS)) {
    if (!countOf(key)) continue;
    present.add(key);
    for (const partner of entry.secondary) if (countOf(partner)) present.add(partner);
  }

  for (const [key, entry] of Object.entries(PAIRINGS)) {
    if (!countOf(key) || outclassed(key, present)) continue;

    // A partner qualifies as a two-of, or as a split of the same species
    // (Magnezone plus Magnezone ex at one each). One-of tech cards from an
    // unrelated line, like Castform or Ogerpon, do not earn a name.
    const candidates: string[][] = [[key]];
    const keySpecies = speciesOf(key);
    for (const partner of entry.secondary) {
      if (outclassed(partner, present)) continue;
      if (countOf(partner) >= 2) candidates.push([key, partner]);
      else if (countOf(partner) > 0 && speciesOf(partner) === keySpecies) {
        candidates.push([key, partner]);
      }
    }

    for (const match of candidates) {
      // A pair from the archetype's own line beats a bigger unrelated pair,
      // so Oricorio does not outrank the Magnezone split it supports.
      const sameLine = match.length > 1 && isSameLine(match[0], match[1]) ? 1e12 : 0;
      const score = scorePair(match, countOf) + sameLine;
      if (score > bestScore) {
        bestScore = score;
        best = match;
        bestKey = key;
      } else if (score === bestScore && best) {
        const ordered = [...match].sort((a, b) => a.localeCompare(b)).join("&");
        const bestOrdered = [...best].sort((a, b) => a.localeCompare(b)).join("&");
        if (ordered < bestOrdered) best = match;
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
      if (bestKey === b) return 1;
      if (bestKey === a) return -1;
      // Two ex cards of equal tier: the one that anchors its pairing names
      // (Mimikyu ex over Giratina ex) leads.
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
