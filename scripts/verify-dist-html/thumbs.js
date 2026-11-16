// scripts/verify-dist-html/thumbs.js
// Deck and card thumbnail and deck page image checks.
const fs = require("fs");
const path = require("path");
const { deckNameToIconIds } = require("../deck-name.mjs");
const { deckSlug } = require("../deck-slug.mjs");
const { CARD_THUMB_WIDTHS, DECK_THUMB_SIZES, DECK_THUMB_VERSION, deckListCardIds } = require("../deck-thumbs.mjs");
const { archiveOnlyHubs } = require("./hubs");
const { DIST_DIR, deckDetailEntries, deckPageEntries, loadDecks } = require("./shared");

const findMissingDeckThumbs = (dir = DIST_DIR, decks = loadDecks()) => {
  const thumbDir = path.join(dir, "thumbs", `v${DECK_THUMB_VERSION}`);
  const ids = new Set();
  for (const deck of decks) {
    for (const id of deckNameToIconIds(deck.name)) ids.add(id);
  }
  return [...ids].flatMap((id) =>
    DECK_THUMB_SIZES.filter(
      (size) => !fs.existsSync(path.join(thumbDir, `${id}-${size}.webp`))
    ).map((size) => `${id}-${size}`)
  );
};

const findMissingCardThumbs = (dir = DIST_DIR, decks = loadDecks()) => {
  const cardDir = path.join(dir, "thumbs", `v${DECK_THUMB_VERSION}`, "cards");
  return deckListCardIds(decks).flatMap((id) =>
    CARD_THUMB_WIDTHS.filter(
      (width) => !fs.existsSync(path.join(cardDir, `${id}-${width}.webp`))
    ).map((width) => `${id}-${width}`)
  );
};

const collectImagePreloads = (html) =>
  [...html.matchAll(/<link\b[^>]*>/gi)]
    .map((match) => match[0])
    .filter((tag) => /rel=["']preload["']/i.test(tag) && /as=["']image["']/i.test(tag));

const imageCandidates = (tag) =>
  (tag.match(/imagesrcset=["']([^"']*)["']/i)?.[1] ?? "")
    .split(",")
    .map((candidate) => candidate.trim().split(/\s+/)[0])
    .filter(Boolean);

// Preloads without imagesrcset point at one file through href.
const preloadCandidates = (tag) => {
  const srcset = imageCandidates(tag);
  if (srcset.length > 0) return srcset;
  const href = tag.match(/\shref=["']([^"']+)["']/i)?.[1];
  return href ? [href] : [];
};

const deckImagePreloadIssues = (
  dist,
  hubSlugs = new Set(archiveOnlyHubs()),
  cardlessSlugs = new Set()
) =>
  deckDetailEntries(dist)
    .filter((entry) => !hubSlugs.has(path.basename(path.dirname(entry))))
    .flatMap((entry) => {
    const tags = collectImagePreloads(dist.read(entry));
    const expected = cardlessSlugs.has(path.basename(path.dirname(entry))) ? 0 : 1;
    if (tags.length !== expected) {
      return [`${entry}: expected ${expected} image preload${expected === 1 ? "" : "s"}, found ${tags.length}`];
    }
    if (expected === 0) return [];
    const candidates = preloadCandidates(tags[0]);
    if (candidates.length === 0) return [`${entry}: image preload has no href or imagesrcset`];
    return candidates.flatMap((candidate) => {
      const url = candidate.split("?")[0];
      if (!url.startsWith("/thumbs/")) return [`${entry}: ${candidate} is outside /thumbs/`];
      return dist.has(url) ? [] : [`${entry}: ${url} is not built`];
    });
  });

const findMissingLiveDeckPages = (dir = DIST_DIR, decks = loadDecks()) =>
  decks.flatMap((deck) => {
    return deckPageEntries(deckSlug(deck.name))
      .filter((entry) => !fs.existsSync(path.join(dir, entry)))
      .map((entry) => `${entry}: missing`);
  });

module.exports = {
  findMissingDeckThumbs,
  findMissingCardThumbs,
  collectImagePreloads,
  imageCandidates,
  deckImagePreloadIssues,
  findMissingLiveDeckPages,
};
