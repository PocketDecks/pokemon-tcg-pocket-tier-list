import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deckSlug } from "./deck-slug.mjs";
import { isMainModule } from "./is-main-module.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PREMIUM_DECK_SLUGS_FILE = path.join(ROOT, "src", "data", "premium-deck-slugs.json");
export const PREMIUM_WINDOWS = ["30d", "all"];

const SAFE_SLUG = /^[a-z0-9&-]+$/;

export const loadPremiumDeckSlugs = (file = PREMIUM_DECK_SLUGS_FILE) =>
  JSON.parse(fs.readFileSync(file, "utf8"));

export const premiumDeckSlugIssues = (slugs, defaultSlugs) => {
  if (slugs === null || typeof slugs !== "object" || Array.isArray(slugs)) {
    return ["expected an object keyed by slug"];
  }
  const keys = Object.keys(slugs);
  const issues = [];
  if (keys.some((key, index) => index > 0 && keys[index - 1] > key)) issues.push("slugs are not sorted");
  for (const slug of keys) {
    if (!SAFE_SLUG.test(slug)) {
      issues.push(`${slug}: not a safe slug`);
      continue;
    }
    if (defaultSlugs.has(slug)) issues.push(`${slug}: also offered in the default window`);
    const windows = slugs[slug];
    const valid =
      Array.isArray(windows) &&
      windows.length > 0 &&
      new Set(windows).size === windows.length &&
      windows.every((window) => PREMIUM_WINDOWS.includes(window));
    if (!valid) issues.push(`${slug}: expected a list of premium windows`);
  }
  return issues;
};

const main = () => {
  const decks = JSON.parse(
    fs.readFileSync(path.join(ROOT, "public", "data", "best-decks.json"), "utf8")
  );
  const issues = premiumDeckSlugIssues(
    loadPremiumDeckSlugs(),
    new Set(decks.map((deck) => deckSlug(deck.name)))
  );
  if (issues.length > 0) {
    console.error(`${PREMIUM_DECK_SLUGS_FILE} is invalid:\n${issues.join("\n")}`);
    process.exit(1);
  }
  console.log("premium-deck-slugs: current");
};

if (isMainModule(import.meta.url)) {
  if (process.argv.includes("--check")) main();
}
