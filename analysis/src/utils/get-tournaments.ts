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
  return tournaments
    .filter(
      (tournament) =>
        tournament.players && tournament.players >= MIN_PLAYERS_IN_TOURNAMENT
    )
    .filter((tournament) => !processedTournamentIds.has(tournament.id));
};
