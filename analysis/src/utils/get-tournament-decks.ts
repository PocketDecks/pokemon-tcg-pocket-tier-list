import { Tournament } from "./types";
import { getPairings } from "./get-pairings";
import { fetchLimitless, LimitlessError } from "./limitless-client";

const isValidCard = (card: any): boolean =>
  !!card &&
  typeof card.name === "string" &&
  card.name.trim() !== "" &&
  typeof card.set === "string" &&
  card.set.trim() !== "" &&
  typeof card.number === "string" &&
  card.number.trim() !== "" &&
  typeof card.count === "number" &&
  card.count >= 0;

const hasSubmittedDecklist = (deck: any): boolean =>
  !!deck.decklist &&
  !!deck.decklist.pokemon &&
  !!deck.decklist.trainer &&
  !!deck.record &&
  typeof deck.record.wins === "number" &&
  typeof deck.record.losses === "number";

const hasValidCards = (deck: any): boolean =>
  Array.isArray(deck.decklist.pokemon) &&
  Array.isArray(deck.decklist.trainer) &&
  deck.decklist.pokemon.every(isValidCard) &&
  deck.decklist.trainer.every(isValidCard);

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
  const standings = await fetchLimitless<any[]>(
    `/tournaments/${tournament.id}/standings`
  );

  // A non-array payload would throw inside filter with a message naming
  // neither the tournament nor the payload, so name it here.
  if (!Array.isArray(standings)) {
    throw new LimitlessError(
      `Tournament ${tournament.id}: standings response was ${typeof standings}, expected an array`
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

  const amountWithEx = decks.filter((deck: any) => {
    return deck.decklist.pokemon.some((card: any) => card.name.endsWith(" ex"));
  }).length;
  const tournamentExPercent = amountWithEx / decks.length;
  const noTrainerPercent =
    decks.filter((deck: any) => deck.decklist.trainer.length === 0).length /
    decks.length;

  const pairings = await getPairings(tournament);
  const winsById = groupBy(
    pairings.map((pairing) => ({ key: pairing.winner, value: pairing.loser }))
  );
  const lossesById = groupBy(
    pairings.map((pairing) => ({ key: pairing.loser, value: pairing.winner }))
  );

  return decks.map((deck: any) => {
    const id = `${tournament.id}-${deck.player}`;

    return {
      id,
      cards: [...deck.decklist.pokemon, ...deck.decklist.trainer],
      pokemon: deck.decklist.pokemon.reduce((acc: number, card: any) => {
        return acc + card.count;
      }, 0),
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
