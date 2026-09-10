import { Pairing, Tournament } from "./types";

const BASE = "https://play.limitlesstcg.com/api";

const apiKey = () => {
  const key = process.env.LIMITLESS_API_KEY;
  if (!key) throw new Error("LIMITLESS_API_KEY not set");
  return key;
};

// Fetches a tournament's pairings and tags each with its tournament id.
export const getPairings = async (tournament: Tournament) => {
  const res = await fetch(
    `${BASE}/tournaments/${tournament.id}/pairings?key=${apiKey()}`
  );
  const pairings: Pairing[] = (await res.json()) as Pairing[];
  return pairings.map((pairing) => {
    return {
      winner: `${tournament.id}-${pairing.winner}`,
      loser: `${tournament.id}-${
        pairing.player1 === pairing.winner ? pairing.player2 : pairing.player1
      }`,
    };
  });
};
