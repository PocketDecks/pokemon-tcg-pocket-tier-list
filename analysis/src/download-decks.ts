import "./load-env-side-effect";
import fs from "fs";
import path from "path";
import { getTournaments } from "./utils/get-tournaments";
import getTournamentDecks from "./utils/get-tournament-decks";
import { mapWithConcurrency } from "./utils/limitless-client";
import { MANIFEST_FILE, planDeckWrites } from "./utils/deck-store";
import { decksDir, processedFile } from "./utils/data-paths";
import { round } from "./utils/round";
import { writeArtefacts } from "./utils/write-artifacts";

export const BATCH_SIZE = 20;
export const CONCURRENCY = 3;

export const readProcessed = (): unknown[] => {
  const file = processedFile();
  const hasStore = fs.existsSync(path.join(decksDir(), MANIFEST_FILE));
  if (!fs.existsSync(file)) {
    if (hasStore) {
      throw new Error("The deck store and processed-tournaments.json must exist together");
    }
    return [];
  }
  const value = JSON.parse(fs.readFileSync(file, "utf-8"));
  if (!Array.isArray(value)) throw new Error(`${file} must contain an array`);
  if (value.length > 0 && !hasStore) {
    throw new Error("The deck store and processed-tournaments.json must exist together");
  }
  return value;
};

export const downloadDecks = async () => {
  const apiKey = process.env.LIMITLESS_API_KEY;
  if (!apiKey) throw new Error("LIMITLESS_API_KEY not set");

  const tournaments = await getTournaments();
  console.log(`Downloaded tournaments\n${tournaments.length} to process`);

  let processed = readProcessed();
  fs.mkdirSync(decksDir(), { recursive: true });

  for (let start = 0; start < tournaments.length; start += BATCH_SIZE) {
    const batch = tournaments.slice(start, start + BATCH_SIZE);
    const downloaded = await mapWithConcurrency(batch, CONCURRENCY, (tournament) =>
      getTournamentDecks(tournament)
    );

    processed = [
      ...processed,
      ...batch.map((tournament) => ({ id: tournament.id, date: tournament.date })),
    ];
    writeArtefacts({
      ...planDeckWrites(decksDir(), downloaded.flat()),
      [processedFile()]: JSON.stringify(processed),
    });

    console.log(`${round((Math.min(start + BATCH_SIZE, tournaments.length) / tournaments.length) * 100, 2)}%`);
  }
};

if (process.argv[1]?.endsWith("download-decks.ts")) {
  downloadDecks().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
