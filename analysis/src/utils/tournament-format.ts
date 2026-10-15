import { Tournament } from "./types";
import { MAX_BANNED_CARDS } from "../settings";
import { LimitlessError } from "./limitless-client";

export interface TournamentDetails {
  id?: string;
  specialRules?: unknown;
  bannedCards?: unknown;
}

const asArray = (value: unknown, field: string, id?: string): unknown[] => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new LimitlessError(
      `Tournament ${id}: ${field} response was ${typeof value}, expected an array`
    );
  }
  return value;
};

// Rule 1: a null or absent listing format is standard play; every named format
// other than STANDARD is dropped, including any value Limitless adds later.
export const isStandardListing = (tournament: Tournament): boolean => {
  const format = tournament.format;
  return format === undefined || format === null || format === "STANDARD";
};

interface BannedCard {
  name?: unknown;
  set?: unknown;
}

const isBannedCard = (value: unknown): value is BannedCard =>
  typeof value === "object" && value !== null;

// Rules 2 to 4: returns null when the details show standard play, or a short
// reason when they do not.
export const nonStandardReason = (details: TournamentDetails): string | null => {
  const specialRules = asArray(details.specialRules, "specialRules", details.id);
  if (specialRules.length > 0) return `special rules ${specialRules.join(" ")}`;

  const bannedCards = asArray(details.bannedCards, "bannedCards", details.id);
  const wholeSet = bannedCards.find(
    (card): card is BannedCard => isBannedCard(card) && card.name === "*"
  );
  if (wholeSet) return `bans set ${wholeSet.set}`;
  if (bannedCards.length > MAX_BANNED_CARDS) return `bans ${bannedCards.length} cards`;

  return null;
};
