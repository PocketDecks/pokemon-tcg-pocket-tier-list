import { Tournament } from "./types";
import { getPairings } from "./get-pairings";

const BASE = "https://play.limitlesstcg.com/api";

const apiKey = () => {
  const key = process.env.LIMITLESS_API_KEY;
  if (!key) throw new Error("LIMITLESS_API_KEY not set");
  return key;
};

// Downloads one tournament's standings and maps them to scored, result-tagged decks.
const getTournamentDecks = async (tournament: Tournament) => {
  const res = await fetch(
    `${BASE}/tournaments/${tournament.id}/standings?key=${apiKey()}`
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch tournament decks: ${res.status} ${res.statusText}`);
  }
  const decks_: any = await res.json();

  const decks = decks_.filter(
      (deck: any) =>
        !!deck.decklist &&
        !!deck.decklist.pokemon &&
        !!deck.decklist.trainer &&
        !!deck.record &&
        typeof deck.record.wins === "number" &&
        typeof deck.record.losses === "number"
    );

  const amountWithEx = decks.filter((deck: any) => {
    return deck.decklist.pokemon.some((card: any) => card.name.endsWith(" ex"));
  }).length;
  const tournamentExPercent = amountWithEx / decks.length;
  const noTrainerPercent =
    decks.filter((deck: any) => deck.decklist.trainer.length === 0).length /
    decks.length;

  const pairings = await getPairings(tournament);

  return decks.map((deck: any) => {
    const id = `${tournament.id}-${deck.player}`;
    const wins = pairings
      .filter((pairing) => {
        return pairing.winner === id;
      })
      .map((pairing) => {
        return pairing.loser;
      });
    const losses = pairings
      .filter((pairing) => {
        return pairing.loser === id;
      })
      .map((pairing) => {
        return pairing.winner;
      });

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
      wins,
      losses,
    };
  });
};

export default getTournamentDecks;
