import path from "node:path";
import { migrateLegacyDecks } from "../src/utils/migrate-legacy-decks";

const ROOT = path.resolve(__dirname, "..");

const argument = (flag: string, fallback: string): string => {
  const index = process.argv.indexOf(flag);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};

const from = path.resolve(argument("--from", path.join(ROOT, "data", "decks.json")));
const to = path.resolve(argument("--to", path.join(ROOT, "data", "decks")));

const result = migrateLegacyDecks(from, to);

for (const [shard, count] of Object.entries(result.perShard)) {
  console.log(`${shard.padEnd(6)} ${String(count).padStart(7)}`);
}
console.log(`legacy ${result.legacy}, stored ${result.stored}, problems ${result.problems.length}`);

if (result.problems.length > 0) {
  for (const problem of result.problems.slice(0, 20)) {
    console.error(`${problem.shard}: ${problem.message}`);
  }
  process.exitCode = 1;
}
