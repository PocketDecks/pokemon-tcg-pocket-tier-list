import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const ARCHIVE_FILE = path.join(ROOT, "public", "data", "deck-archive.json");
export const OUT_FILE = path.join(ROOT, "src", "data", "deck-hub-slugs.json");

export const renderHubSlugs = (archive) =>
  `${JSON.stringify([...new Set(archive.map((entry) => entry.hub))].sort(), null, 2)}\n`;

const main = () => {
  const archive = JSON.parse(fs.readFileSync(ARCHIVE_FILE, "utf8"));
  const text = renderHubSlugs(archive);
  if (process.argv.includes("--check")) {
    const current = fs.existsSync(OUT_FILE) ? fs.readFileSync(OUT_FILE, "utf8") : null;
    if (current !== text) {
      console.error(`${OUT_FILE} is stale; run node scripts/generate-deck-hub-slugs.mjs`);
      process.exit(1);
    }
    console.log("generate-deck-hub-slugs: current");
    return;
  }
  fs.writeFileSync(OUT_FILE, text);
  console.log(`generate-deck-hub-slugs: wrote ${archive.length > 0 ? new Set(archive.map((entry) => entry.hub)).size : 0} hub slugs`);
};

const runAsMain = () => {
  if (!process.argv[1]) return false;
  const modulePath = fileURLToPath(import.meta.url);
  try {
    return fs.realpathSync.native(process.argv[1]) === fs.realpathSync.native(modulePath);
  } catch {
    return path.resolve(process.argv[1]) === path.resolve(modulePath);
  }
};
if (runAsMain()) main();
