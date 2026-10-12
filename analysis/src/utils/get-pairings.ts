import { Pairing, Tournament } from "./types";
import { fetchLimitless } from "./limitless-client";

// Fetches a tournament's pairings and tags each with its tournament id.
export const getPairings = async (tournament: Tournament) => {
  const pairings = await fetchLimitless<Pairing[]>(
    `/tournaments/${tournament.id}/pairings`
  );
  return pairings
    .filter((pairing) => typeof pairing.winner === "string" && pairing.winner !== "")
    .map((pairing) => {
      return {
        winner: `${tournament.id}-${pairing.winner}`,
        loser: `${tournament.id}-${
          pairing.player1 === pairing.winner ? pairing.player2 : pairing.player1
        }`,
      };
    });
};
