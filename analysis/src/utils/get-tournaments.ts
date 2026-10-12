import fs from "fs";
import { Tournament } from "./types";
import { MIN_PLAYERS_IN_TOURNAMENT } from "../settings";
import { processedFile } from "./data-paths";
import { fetchLimitless } from "./limitless-client";

const GAME = "POCKET";

const readProcessedTournaments = (): Tournament[] => {
  if (!fs.existsSync(processedFile())) return [];
  return JSON.parse(fs.readFileSync(processedFile(), "utf-8"));
};

// Lists unprocessed tournaments with enough players to count.
export const getTournaments = async () => {
  const tournaments = await fetchLimitless<Tournament[]>("/tournaments", {
    limit: 10000,
    game: GAME,
  });
  const processedTournamentIds = new Set(
    readProcessedTournaments().map((t: Tournament) => t.id)
  );
  // The API pages its listing, so an id can arrive twice. The downloader
  // checkpoints by appending, so a repeat would download a tournament twice
  // and then trip the duplicate guard in planDeckWrites.
  const seen = new Set<string>();
  return tournaments.filter((tournament) => {
    if (!tournament.players || tournament.players < MIN_PLAYERS_IN_TOURNAMENT) return false;
    if (processedTournamentIds.has(tournament.id)) return false;
    if (seen.has(tournament.id)) return false;
    seen.add(tournament.id);
    return true;
  });
};
