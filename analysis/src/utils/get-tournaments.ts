import fs from "fs";
import { Tournament } from "./types";
import { MIN_PLAYERS_IN_TOURNAMENT } from "../settings";
import { processedFile } from "./data-paths";
import { fetchLimitless } from "./limitless-client";
import { isStandardListing } from "./tournament-format";

const GAME = "POCKET";

const readProcessedFile = (): Tournament[] =>
  JSON.parse(fs.readFileSync(processedFile(), "utf-8"));

const readProcessedTournaments = (): Tournament[] => {
  if (!fs.existsSync(processedFile())) return [];
  for (let read = 0; read < 2; read += 1) {
    try {
      return readProcessedFile();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return [];
};

export interface TournamentFilter {
  // Keeps tournaments dated at or after this instant.
  since?: Date;
  processed?: readonly unknown[];
}

// Lists unprocessed tournaments with enough players to count.
export const getTournaments = async ({ since, processed }: TournamentFilter = {}) => {
  const tournaments = await fetchLimitless<Tournament[]>("/tournaments", {
    limit: 10000,
    game: GAME,
  });
  const processedTournamentIds = new Set(
    (processed ?? readProcessedTournaments()).map((entry) => (entry as Tournament).id)
  );
  // The API pages its listing, so an id can arrive twice. The downloader
  // checkpoints by appending, so a repeat would download a tournament twice
  // and then trip the duplicate guard in planDeckWrites.
  const seen = new Set<string>();
  return tournaments.filter((tournament) => {
    // The listing format decides rule 1; a custom or no-ex event is not the meta.
    if (!isStandardListing(tournament)) return false;
    if (!tournament.players || tournament.players < MIN_PLAYERS_IN_TOURNAMENT) return false;
    if (since && !(Date.parse(tournament.date) >= since.getTime())) return false;
    if (processedTournamentIds.has(tournament.id)) return false;
    if (seen.has(tournament.id)) return false;
    seen.add(tournament.id);
    return true;
  });
};
