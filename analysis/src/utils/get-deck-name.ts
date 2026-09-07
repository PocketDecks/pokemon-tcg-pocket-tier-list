import cardToString from "./card-to-string";
import { Deck } from "./types";
import formatName from "./format-name";
import pairings from "../data/limitless-pairings.json";


interface PairingEntry {
  secondary: string[];
  peakCountBySet?: Record<string, number>;
  names?: Record<string, number>;
}
const PAIRINGS = (pairings as { pairings?: Record<string, PairingEntry> }).pairings ?? {};

// Newest set the scrape covers, so scoring tracks the live format rather
// than a card's all-time reach.
const CURRENT_SET = (() => {
  const counts = new Map<string, number>();
  for (const entry of Object.values(PAIRINGS)) {
    for (const [set, n] of Object.entries(entry.peakCountBySet ?? {})) {
      counts.set(set, (counts.get(set) ?? 0) + n);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
})();

// Peak in the current set, falling back to the all-set total for cards the
// current set does not carry. Ties break alphabetically so the leader is
// stable across runs and does not depend on JSON order.
const peakSum = (name: string): number => {
  const entry = PAIRINGS[name];
  if (!entry?.peakCountBySet) return 0;
  const current = CURRENT_SET ? entry.peakCountBySet[CURRENT_SET] : undefined;
  if (current !== undefined) return current;
  return Object.values(entry.peakCountBySet).reduce((acc, n) => acc + n, 0);
};

// Copy count dominates so a two-of centrepiece beats a one-of with a higher
// peak. Population only separates cards equally present in the deck.
const scorePair = (match: string[], countOf: (n: string) => number): number => {
  const copies = match.reduce((acc, name) => acc + countOf(name), 0);
  const reach = match.reduce((acc, name) => acc + peakSum(name), 0);
  return copies * 1e9 + reach;
};

const matchPairing = (cards: Deck["cards"]): string[] | null => {
  const cardStrings = new Set(cards.map((card) => cardToString(card)));
  const countOf = (name: string) => {
    if (cardStrings.has(`2 ${name}`)) return 2;
    return cardStrings.has(`1 ${name}`) ? 1 : 0;
  };

  let best: string[] | null = null;
  let bestScore = -1;

  for (const [key, entry] of Object.entries(PAIRINGS)) {
    if (!countOf(key)) continue;

    const candidates: string[][] = [[key]];
    for (const partner of entry.secondary) {
      if (countOf(partner)) candidates.push([key, partner]);
    }

    for (const match of candidates) {
      const score = scorePair(match, countOf);
      if (score > bestScore) {
        bestScore = score;
        best = match;
      } else if (score === bestScore && best) {
        const ordered = [...match].sort((a, b) => a.localeCompare(b)).join("&");
        const bestOrdered = [...best].sort((a, b) => a.localeCompare(b)).join("&");
        if (ordered < bestOrdered) best = match;
      }
    }
  }

  // The centrepiece leads: most copies first, then popularity, then name.
  if (best && best.length > 1) {
    best = [...best].sort((a, b) => {
      const byCopies = countOf(b) - countOf(a);
      if (byCopies !== 0) return byCopies;
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
