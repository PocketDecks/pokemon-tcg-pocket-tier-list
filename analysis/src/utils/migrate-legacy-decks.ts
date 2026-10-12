import fs from "fs";
import { planDeckWrites, readManifest, StoreProblem, verifyStore } from "./deck-store";
import { writeArtefacts } from "./write-artifacts";
import { Deck } from "./types";

export interface MigrationResult {
  legacy: number;
  stored: number;
  perShard: Record<string, number>;
  problems: StoreProblem[];
}

export const migrateLegacyDecks = (from: string, to: string): MigrationResult => {
  if (!fs.existsSync(from)) throw new Error(`Legacy decks file not found: ${from}`);
  if (Object.keys(readManifest(to).shards).length > 0) {
    throw new Error(`${to} already holds a migrated store; refusing to overwrite`);
  }

  const parsed: unknown = JSON.parse(fs.readFileSync(from, "utf8"));
  if (!Array.isArray(parsed)) throw new Error(`${from} must contain an array`);
  const decks = parsed as Deck[];

  fs.mkdirSync(to, { recursive: true });
  writeArtefacts(planDeckWrites(to, decks));

  const manifest = readManifest(to);
  const perShard = Object.fromEntries(
    Object.keys(manifest.shards)
      .sort()
      .map((id) => [id, manifest.shards[id].count])
  );
  const stored = Object.values(perShard).reduce((sum, count) => sum + count, 0);
  const problems = verifyStore(to, { placement: true });
  if (stored !== decks.length) {
    problems.push({ shard: "*", message: `legacy file holds ${decks.length} decks but the store holds ${stored}` });
  }
  return { legacy: decks.length, stored, perShard, problems };
};
