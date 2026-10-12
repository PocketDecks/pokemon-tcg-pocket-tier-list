import path from "path";

export const dataDir = (): string => process.env.ANALYSIS_DATA_DIR || "./data";

export const processedFile = (): string => path.join(dataDir(), "processed-tournaments.json");

export const decksDir = (): string => process.env.DECKS_DIR || path.join(dataDir(), "decks");
