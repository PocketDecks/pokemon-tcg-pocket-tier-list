import fs from "node:fs";
import path from "node:path";
import { deckSlug } from "./deck-slug.mjs";
import { writeFileAtomic } from "./atomic-write.mjs";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARCHIVE_FILE = path.join(ROOT, "public", "data", "deck-archive.json");
const CONFIG_FILE = path.join(ROOT, "firebase.json");
const PREFIXES = ["", "/ja"];
const SUFFIX = "{,/**}";
const GENERATED_SOURCE = /^(\/ja)?\/deck\/.*\{,\/\*\*\}$/;
const GLOB_METACHARACTERS = /[*?[\]{}()!@+]/;

const literalSlug = (slug) => {
  if (GLOB_METACHARACTERS.test(slug)) throw new Error(`Deck slug contains a glob metacharacter: ${slug}`);
  return slug;
};

const deckRedirect = (prefix, from, to) => ({
  source: `${prefix}/deck/${literalSlug(from)}${SUFFIX}`,
  destination: `${prefix}/deck/${to}/`,
  type: 301,
});

export const redirectRules = (archive, liveSlugs) =>
  PREFIXES.flatMap((prefix) =>
    archive.flatMap((entry) => {
      const live = liveSlugs.has(entry.variant);
      const retired = !live && entry.variant !== entry.hub
        ? [deckRedirect(prefix, entry.variant, entry.hub)]
        : [];
      const legacy = (entry.legacySlugs ?? []).map((slug) =>
        deckRedirect(prefix, slug, live ? entry.variant : entry.hub)
      );
      return [...retired, ...legacy];
    })
  );

const main = () => {
  const archive = JSON.parse(fs.readFileSync(ARCHIVE_FILE, "utf8"));
  const liveSlugs = new Set(
    JSON.parse(fs.readFileSync(path.join(ROOT, "public", "data", "best-decks.json"), "utf8"))
      .map((deck) => deckSlug(deck.name))
  );
  const rules = redirectRules(archive, liveSlugs);
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  const existing = config.hosting.redirects.filter((rule) => !GENERATED_SOURCE.test(rule.source ?? ""));
  const output = `${JSON.stringify({ ...config, hosting: { ...config.hosting, redirects: [...existing, ...rules] } }, null, 2)}\n`;
  if (process.argv.includes("--check")) {
    const current = fs.readFileSync(CONFIG_FILE, "utf8");
    if (current !== output) {
      console.error(`${CONFIG_FILE} is out of date`);
      process.exit(1);
    }
    return;
  }
  writeFileAtomic(CONFIG_FILE, output);
  console.log(`Wrote ${rules.length} archived deck redirects to ${CONFIG_FILE}`);
};

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
