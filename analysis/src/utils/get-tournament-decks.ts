import { Card, Tournament } from "./types";
import { getPairings } from "./get-pairings";
import { fetchLimitless, LimitlessError } from "./limitless-client";
import { nonStandardReason, TournamentDetails } from "./tournament-format";

interface SubmittedStanding {
  player?: unknown;
  decklist: { pokemon: unknown; trainer: unknown };
  record: { wins: number; losses: number };
}

interface ValidStanding extends SubmittedStanding {
  decklist: { pokemon: Card[]; trainer: Card[] };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim() !== "";

const isValidCard = (card: unknown): card is Card =>
  isRecord(card) &&
  isNonEmptyString(card.name) &&
  isNonEmptyString(card.set) &&
  isNonEmptyString(card.number) &&
  typeof card.count === "number" &&
  card.count >= 0;

const hasSubmittedDecklist = (standing: unknown): standing is SubmittedStanding =>
  isRecord(standing) &&
  isRecord(standing.decklist) &&
  !!standing.decklist.pokemon &&
  !!standing.decklist.trainer &&
  isRecord(standing.record) &&
  typeof standing.record.wins === "number" &&
  typeof standing.record.losses === "number";

const hasValidCards = (standing: SubmittedStanding): standing is ValidStanding =>
  Array.isArray(standing.decklist.pokemon) &&
  Array.isArray(standing.decklist.trainer) &&
  standing.decklist.pokemon.every(isValidCard) &&
  standing.decklist.trainer.every(isValidCard);

const groupBy = (pairs: { key: string; value: string }[]): Map<string, string[]> => {
  const grouped = new Map<string, string[]>();
  for (const { key, value } of pairs) {
    const group = grouped.get(key);
    if (group) group.push(value);
    else grouped.set(key, [value]);
  }
  return grouped;
};

// Downloads one tournament's standings and maps them to scored, result-tagged decks.
const getTournamentDecks = async (tournament: Tournament) => {
  // The details decide the format before any standings or pairings request.
  const details = await fetchLimitless<TournamentDetails>(
    `/tournaments/${tournament.id}/details`
  );
  // The id is merged in so a malformed details error names the tournament.
  const reason = nonStandardReason({ ...details, id: tournament.id });
  if (reason) {
    console.log(`Tournament ${tournament.id}: skipped, ${reason}`);
    return [];
  }

  const standings = await fetchLimitless<unknown>(
    `/tournaments/${tournament.id}/standings`
  );

  // A non-array payload would throw inside filter with a message naming
  // neither the tournament nor the payload, so name it here.
  if (!Array.isArray(standings)) {
    throw new LimitlessError(
      `Tournament ${tournament.id}: standings response was ${typeof standings}, expected an array`
    );
  }

  const malformedRow = standings.findIndex((row) => !isRecord(row));
  if (malformedRow !== -1) {
    const row = standings[malformedRow];
    throw new LimitlessError(
      `Tournament ${tournament.id}: standings row ${malformedRow} was ${row === null ? "null" : typeof row}, expected an object`
    );
  }

  const submitted = standings.filter(hasSubmittedDecklist);
  const decks = submitted.filter(hasValidCards);
  if (decks.length < submitted.length) {
    console.warn(
      `Tournament ${tournament.id}: skipped ${submitted.length - decks.length} decks with malformed cards`
    );
  }
  if (decks.length === 0) return [];

  const amountWithEx = decks.filter((deck) =>
    deck.decklist.pokemon.some((card) => card.name.endsWith(" ex"))
  ).length;
  const tournamentExPercent = amountWithEx / decks.length;
  const noTrainerPercent =
    decks.filter((deck) => deck.decklist.trainer.length === 0).length /
    decks.length;

  const pairings = await getPairings(tournament);
  const winsById = groupBy(
    pairings.map((pairing) => ({ key: pairing.winner, value: pairing.loser }))
  );
  const lossesById = groupBy(
    pairings.map((pairing) => ({ key: pairing.loser, value: pairing.winner }))
  );

  return decks.map((deck) => {
    const id = `${tournament.id}-${deck.player}`;

    return {
      id,
      cards: [...deck.decklist.pokemon, ...deck.decklist.trainer],
      pokemon: deck.decklist.pokemon.reduce((acc, card) => acc + card.count, 0),
      differentPokemon: deck.decklist.pokemon.length,
      winCount: deck.record.wins,
      lossCount: deck.record.losses,
      totalGames: deck.record.wins + deck.record.losses,
      date: tournament.date,
      tournamentExPercent,
      noTrainerPercent,
      wins: [...(winsById.get(id) ?? [])],
      losses: [...(lossesById.get(id) ?? [])],
    };
  });
};

export default getTournamentDecks;
