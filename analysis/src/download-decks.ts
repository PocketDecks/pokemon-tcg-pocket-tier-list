import "dotenv/config";
import fs from "fs";
import { getTournaments } from "./utils/get-tournaments";
import getTournamentDecks from "./utils/get-tournament-decks";
import { round } from "./utils/round";
import { writeArtefacts } from "./utils/write-artifacts";

const DECKS_FILE = "./data/decks.json";
const PROCESSED_FILE = "./data/processed-tournaments.json";

const readJsonArray = (filePath: string): unknown[] => {
  if (!fs.existsSync(filePath)) return [];
  const value = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  if (!Array.isArray(value)) throw new Error(`${filePath} must contain an array`);
  return value;
};

const readDataPair = (): { decks: unknown[]; processed: unknown[] } => {
  const decksExists = fs.existsSync(DECKS_FILE);
  const processedExists = fs.existsSync(PROCESSED_FILE);
  if (decksExists !== processedExists) {
    throw new Error("decks.json and processed-tournaments.json must exist together");
  }
  return {
    decks: readJsonArray(DECKS_FILE),
    processed: readJsonArray(PROCESSED_FILE),
  };
};

export const downloadDecks = async () => {
  const apiKey = process.env.LIMITLESS_API_KEY;
  if (!apiKey) throw new Error("LIMITLESS_API_KEY not set");

  const tournaments = await getTournaments();
  console.log(`Downloaded tournaments\n${tournaments.length} to process`);

  const { decks: currentDecks, processed } = readDataPair();
  const nextDecks = [...currentDecks];
  const nextProcessed = [...processed];

  for (let i = 0; i < tournaments.length; i++) {
    const tournament = tournaments[i];
    const decks = await getTournamentDecks(tournament);

    nextDecks.push(...decks);
    nextProcessed.push({ id: tournament.id, date: tournament.date });

    console.log(`${round(((i + 1) / tournaments.length) * 100, 2)}%`);
  }

  fs.mkdirSync("./data", { recursive: true });
  writeArtefacts({
    [DECKS_FILE]: JSON.stringify(nextDecks),
    [PROCESSED_FILE]: JSON.stringify(nextProcessed),
  });
};

if (process.argv[1]?.endsWith("download-decks.ts")) {
  downloadDecks().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
