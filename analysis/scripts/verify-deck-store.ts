import { readManifest, verifyStore } from "../src/utils/deck-store";
import { decksDir } from "../src/utils/data-paths";

const dir = decksDir();
const manifest = readManifest(dir);
const shards = Object.keys(manifest.shards).sort();
const total = shards.reduce((sum, id) => sum + manifest.shards[id].count, 0);
const problems = verifyStore(dir, { placement: true });

console.log(`${shards.length} shards, ${total} decks in ${dir}`);
for (const problem of problems.slice(0, 20)) {
  console.error(`${problem.shard}: ${problem.message}`);
}
if (problems.length > 0) {
  console.error(`${problems.length} problems`);
  process.exitCode = 1;
}
