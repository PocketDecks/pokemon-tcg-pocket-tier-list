import fs from "fs";
import { Tournament } from "./types";
import { MIN_GAMES_IN_TOURNAMENT } from "../settings";

const GAME = "POCKET";
const BASE = "https://play.limitlesstcg.com/api";
const PROCESSED_FILE = "./data/processed-tournaments.json";

const apiKey = () => {
  const key = process.env.LIMITLESS_API_KEY;
  if (!key) throw new Error("LIMITLESS_API_KEY not set");
  return key;
};

const readProcessedTournaments = (): Tournament[] => {
  if (!fs.existsSync(PROCESSED_FILE)) return [];
  return JSON.parse(fs.readFileSync(PROCESSED_FILE, "utf-8"));
};

// Downloads unprocessed tournaments with enough players to count.
export const getTournaments = async () => {
  const res = await fetch(
    `${BASE}/tournaments?key=${apiKey()}&limit=10000&game=${GAME}`
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch tournaments: ${res.status} ${res.statusText}`);
  }
  const tournaments: Tournament[] = (await res.json()) as Tournament[];
  const processedTournamentIds = readProcessedTournaments().map(
    (t: Tournament) => t.id
  );
  return tournaments
    .filter(
      (tournament) =>
        tournament.players && tournament.players >= MIN_GAMES_IN_TOURNAMENT
    )
    .filter((tournament) => !processedTournamentIds.includes(tournament.id));
};
