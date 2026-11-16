// scripts/verify-dist-html/shared.js
// Paths, loaders and DOM helpers shared by the verifier checks.
const fs = require("fs");
const path = require("path");
const { deckSlug } = require("../deck-slug.mjs");
const { loadPremiumDeckSlugs } = require("../premium-deck-slugs.mjs");
const { localeRoute, ROUTE_LOCALES } = require("../locale-route.mjs");
const { firstBestListCardId } = require("../deck-thumbs.mjs");

const DIST_DIR = process.env.BUILD_DIR
  ? path.resolve(process.env.BUILD_DIR)
  : path.join(__dirname, "..", "..", "dist");

const FIREBASE_CONFIG_PATH = path.join(__dirname, "..", "..", "firebase.json");

const DATA_DIR = process.env.BUILD_DIR
  ? path.join(DIST_DIR, "data")
  : path.join(__dirname, "..", "..", "public", "data");

const SITE_HOST = "pocketdecks.top";

const premiumDeckSlugList = () => Object.keys(loadPremiumDeckSlugs());

const posixEntry = (entry) => entry.split(path.sep).join("/");

const localeEntryPrefix = (locale) => localeRoute(locale, "/").slice(1);

const LOCALE_ENTRY_PREFIXES = ROUTE_LOCALES.map(localeEntryPrefix);

const deckPageEntries = (slug) => LOCALE_ENTRY_PREFIXES.map((prefix) => `${prefix}deck/${slug}/index.html`);

const premiumShellEntries = (slugs) => new Set(slugs.flatMap(deckPageEntries));

// One listing and one read per page for every check that shares the reader.
const openDist = (dir) => {
  const pages = new Map();
  let files;
  const listFiles = () =>
    (files ??= fs
      .readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name))));
  return {
    dir,
    files: listFiles,
    htmlFiles: () => listFiles().filter((entry) => entry.endsWith(".html")),
    read: (entry) => {
      const key = path.normalize(entry);
      if (!pages.has(key)) pages.set(key, fs.readFileSync(path.join(dir, key), "utf8"));
      return pages.get(key);
    },
    has: (entry) => fs.existsSync(path.join(dir, entry)),
  };
};

const forDir =
  (check) =>
  (dir = DIST_DIR, ...rest) =>
    check(openDist(dir), ...rest);

const EMPTY_ROOT = /<div\b[^>]*id=["']root["'][^>]*>\s*<\/div>/i;

const CANONICAL_TAG = /<link\b[^>]*\brel=["']canonical["'][^>]*>/gi;

const decodeXmlEntities = (value) =>
  value
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

const deckDetailEntries = (dist, shellSlugs = premiumDeckSlugList()) => {
  if (!fs.existsSync(dist.dir)) return [];
  const shells = premiumShellEntries(shellSlugs);
  return dist
    .htmlFiles()
    .filter((entry) => {
      const segments = entry.split(path.sep);
      return segments.length >= 3 && segments.at(-1) === "index.html" && segments.at(-3) === "deck";
    })
    .filter((entry) => !shells.has(posixEntry(entry)))
    .sort();
};

const loadDecks = (dataDir = DATA_DIR) => {
  const decksPath = path.join(dataDir, "best-decks.json");
  try {
    return JSON.parse(fs.readFileSync(decksPath, "utf8"));
  } catch (error) {
    throw new Error(`Unable to load deck data from ${decksPath}: ${error.message}`, {
      cause: error,
    });
  }
};

const loadArchive = (dataDir = DATA_DIR) =>
  JSON.parse(fs.readFileSync(path.join(dataDir, "deck-archive.json"), "utf8"));

const cardlessDeckSlugs = (decks = loadDecks()) =>
  new Set(decks.filter((deck) => firstBestListCardId(deck) === null).map((deck) => deckSlug(deck.name)));

module.exports = {
  DIST_DIR,
  FIREBASE_CONFIG_PATH,
  DATA_DIR,
  SITE_HOST,
  premiumDeckSlugList,
  posixEntry,
  localeEntryPrefix,
  LOCALE_ENTRY_PREFIXES,
  deckPageEntries,
  premiumShellEntries,
  openDist,
  forDir,
  EMPTY_ROOT,
  CANONICAL_TAG,
  decodeXmlEntities,
  deckDetailEntries,
  loadDecks,
  loadArchive,
  cardlessDeckSlugs,
};
