// scripts/verify-dist-html/premium.js
// Premium data files and premium deck shell checks.
const path = require("path");
const { deckSlug } = require("../deck-slug.mjs");
const { PREMIUM_BASES, PREMIUM_WINDOWS, windowArtefactName } = require("../meta-windows.mjs");
const { CANONICAL_TAG, EMPTY_ROOT, deckDetailEntries, deckPageEntries, loadArchive, loadDecks, posixEntry, premiumDeckSlugList, premiumShellEntries } = require("./shared");

const PREMIUM_DATA_FILES = PREMIUM_BASES.flatMap((base) =>
  PREMIUM_WINDOWS.map((window) => `${windowArtefactName(base, window)}.json`)
);

const premiumDataFiles = (dist) => {
  if (!dist.has("data")) return [];
  return dist
    .files()
    .filter((entry) => entry.split(path.sep)[0] === "data" && PREMIUM_DATA_FILES.includes(path.basename(entry)));
};

const defaultOtherDeckSlugs = () => {
  const live = loadDecks().map((deck) => deckSlug(deck.name));
  const hubs = loadArchive().map((entry) => entry.hub);
  return new Set([...live, ...hubs]);
};

const premiumShellIssues = (
  dist,
  { slugs = premiumDeckSlugList(), otherSlugs = defaultOtherDeckSlugs() } = {}
) => {
  const expected = [...premiumShellEntries(slugs)];
  const issues = expected.flatMap((entry) => {
    const local = entry.split("/").join(path.sep);
    if (!dist.has(entry)) return [`${local}: missing`];
    const html = dist.read(entry);
    const robots = (html.match(/<meta\b[^>]*>/gi) ?? []).filter((tag) => /\bname=["']robots["']/i.test(tag));
    return [
      ...(robots.some((tag) => /\bnoindex\b/i.test(tag)) ? [] : [`${local}: no noindex robots meta`]),
      ...((html.match(CANONICAL_TAG) ?? []).length > 0 ? [`${local}: has a canonical`] : []),
      ...(/<link\b[^>]*\bhreflang=/i.test(html) ? [`${local}: has alternates`] : []),
      ...(EMPTY_ROOT.test(html) ? [] : [`${local}: carries rendered content`]),
    ];
  });
  const allowed = new Set([...expected, ...[...otherSlugs].flatMap(deckPageEntries)]);
  const extras = deckDetailEntries(dist, [])
    .map(posixEntry)
    .filter((entry) => !allowed.has(entry))
    .map((entry) => `${entry.split("/").join(path.sep)}: unexpected deck page`);
  return [...issues, ...extras];
};

module.exports = {
  PREMIUM_DATA_FILES,
  premiumDataFiles,
  defaultOtherDeckSlugs,
  premiumShellIssues,
};
