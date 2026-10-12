import fs from "fs";
import { readManifest, verifyStore } from "../src/utils/deck-store";
import { decksDir } from "../src/utils/data-paths";

export interface VerifyOptions {
  dir: string;
  allowEmpty?: boolean;
}

export const runVerify = ({ dir, allowEmpty = false }: VerifyOptions): number => {
  if (!fs.existsSync(dir)) {
    console.error(`Deck store not found: ${dir}`);
    return 1;
  }

  const manifest = readManifest(dir);
  const shards = Object.keys(manifest.shards).sort();
  if (shards.length === 0 && !allowEmpty) {
    console.error(`Deck store at ${dir} holds no shards; pass --allow-empty to accept this`);
    return 1;
  }

  const total = shards.reduce((sum, id) => sum + manifest.shards[id].count, 0);
  const problems = verifyStore(dir, { placement: true });

  console.log(`${shards.length} shards, ${total} decks in ${dir}`);
  for (const problem of problems.slice(0, 20)) {
    console.error(`${problem.shard}: ${problem.message}`);
  }
  if (problems.length > 0) {
    console.error(`${problems.length} problems`);
    return 1;
  }
  return 0;
};

if (process.argv[1]?.endsWith("verify-deck-store.ts")) {
  process.exitCode = runVerify({
    dir: decksDir(),
    allowEmpty: process.argv.includes("--allow-empty"),
  });
}
