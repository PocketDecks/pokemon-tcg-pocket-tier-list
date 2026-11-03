import fs from "node:fs";
import path from "node:path";
import { deckSlug } from "./deck-slug.mjs";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARCHIVE_FILE = path.join(ROOT, "public", "data", "deck-archive.json");
const CONFIG_FILE = path.join(ROOT, "firebase.json");

const main = () => {
  const archive = JSON.parse(fs.readFileSync(ARCHIVE_FILE, "utf8"));
  const live = new Set(
    JSON.parse(fs.readFileSync(path.join(ROOT, "public", "data", "best-decks.json"), "utf8"))
      .map((deck) => deckSlug(deck.name))
  );
  const rules = archive
    .filter((entry) => !live.has(entry.variant) && entry.variant !== entry.hub)
    .map((entry) => ({
      source: `/deck/${entry.variant}{,/**}`,
      destination: `/deck/${entry.hub}/`,
      type: 301,
    }));
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  const existing = config.hosting.redirects.filter(
    (rule) => !rule.source?.startsWith("/deck/") || !rule.source.includes("{,/**}")
  );
  const output = `${JSON.stringify({ ...config, hosting: { ...config.hosting, redirects: [...existing, ...rules] } }, null, 2)}\n`;
  if (process.argv.includes("--check")) {
    const current = fs.readFileSync(CONFIG_FILE, "utf8");
    if (current !== output) {
      console.error(`${CONFIG_FILE} is out of date`);
      process.exit(1);
    }
    return;
  }
  fs.writeFileSync(CONFIG_FILE, output);
  console.log(`Wrote ${rules.length} archived deck redirects to ${CONFIG_FILE}`);
};

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
