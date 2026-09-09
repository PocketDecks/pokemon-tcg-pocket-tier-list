// Card resolution for Limitless deck-page slugs, shared by the scraper and the
// deck-name matcher so the two never disagree about what a slug means.
import cards from "pokemon-tcg-pocket-cards/data/v5/cards.min.json";

import { canonSet, SET_CODE_PATTERN } from "./set-codes";

export interface IndexedCard {
  name: string;
  set: string;
  number: string;
}

interface CardRecord {
  name: string;
  set_code: string;
  id: string;
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// A4b is a deluxe reprint set, so its cards fold onto the earliest earlier
// printing to stop one card spanning several rows.
export const REPRINT_SETS = new Set(["A4b"]);

const cardIndex = new Map<string, IndexedCard[]>();
const unknownSetCodes = new Set<string>();
for (const card of cards as CardRecord[]) {
  let set: string;
  try {
    set = canonSet(card.set_code);
  } catch {
    unknownSetCodes.add(String(card.set_code));
    continue;
  }
  const number = String(Number(card.id.split("-").pop()));
  const entry: IndexedCard = { name: card.name, set, number };
  const key = norm(card.name);
  const bucket = cardIndex.get(key);
  if (bucket) bucket.push(entry);
  else cardIndex.set(key, [entry]);
}

// Slugs carry set codes; reporting an unrecognised one tells the caller a new
// set reached Limitless and the SET_CODES list needs updating.
export const hasUnknownSetCodes = (): boolean => unknownSetCodes.size > 0;
export const unknownSetCodeList = (): string[] => [...unknownSetCodes].sort();

// Splits a slug into [name, set] pairs. The set code anchors each token so a
// slug like "hydreigon-mega-absol-ex-b1" still yields two cards.
export const slugTokens = (slug: string): [string, string][] => {
  const out: [string, string][] = [];
  let rest = slug;
  const re = new RegExp(`^(?<name>.+?)-(?<set>${SET_CODE_PATTERN})(?:-|$)`, "i");
  while (rest) {
    const m = rest.match(re);
    if (!m) break;
    out.push([m.groups!.name, m.groups!.set]);
    rest = rest.slice(m[0].length);
  }
  return out;
};

const canonicalCard = (card: IndexedCard): IndexedCard => {
  if (!REPRINT_SETS.has(card.set)) return card;
  const hits = cardIndex.get(norm(card.name));
  if (!hits?.length) return card;
  const original = hits
    .filter((c) => !REPRINT_SETS.has(c.set))
    .sort((a, b) => a.set.localeCompare(b.set))[0];
  return original ?? card;
};

// Resolves one name/set token to a card, trying the spaced and ex variants
// that Limitless drops from slugs. Falls back to the first printing in the
// wanted set when an exact one is absent.
const resolveCard = (rawName: string, rawSet: string): IndexedCard | null => {
  const wanted = canonSet(rawSet).toLowerCase();
  const spaced = rawName.replace(/-/g, " ");
  const candidates = [
    rawName,
    rawName.replace("rockets", "rocket's"),
    spaced,
    `${spaced} ex`,
    spaced.replace(/ ex$/, ""),
  ];
  for (const candidate of candidates) {
    const hits = cardIndex.get(norm(candidate));
    if (!hits?.length) continue;
    const exact = hits.find((c) => c.set.toLowerCase() === wanted);
    if (exact) return canonicalCard(exact);
    return canonicalCard(hits[0]);
  }
  return null;
};

// Slugs merge two cards into one token when they share a trailing set code
// (hydreigon-mega-absol-ex-b1), so try each hyphen split.
export const resolveToken = (rawName: string, rawSet: string): IndexedCard[] => {
  const direct = resolveCard(rawName, rawSet);
  if (direct) return [direct];

  const parts = rawName.split("-");
  for (let i = 1; i < parts.length; i++) {
    const left = resolveCard(parts.slice(0, i).join("-"), rawSet);
    const right = resolveCard(parts.slice(i).join("-"), rawSet);
    if (left && right && left.name !== right.name) return [left, right];
  }
  return [];
};

// Resolves a whole slug to its cards; empty when a token will not resolve.
export const resolveSlug = (slug: string): IndexedCard[] =>
  slugTokens(slug).flatMap(([rawName, rawSet]) => resolveToken(rawName, rawSet));
