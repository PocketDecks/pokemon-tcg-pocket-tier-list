// scripts/verify-dist-html/decks.js
// Deck page root, styled-components and app state checks.
const { EMPTY_ROOT, deckDetailEntries, premiumDeckSlugList } = require("./shared");

const emptyStyledTags = (dist) =>
  dist.htmlFiles().flatMap((entry) =>
    [...dist.read(entry).matchAll(/<style\b[^>]*data-styled(?:=["'][^"']*["'])?[^>]*>([\s\S]*?)<\/style>/gi)]
      .filter((match) => match[1].trim() === "")
      .map(() => entry)
  );

const BAKED_APP_STATE = ["data-app-visible", "data-consent-pending"];

const bakedAppState = (dist) =>
  dist.htmlFiles().flatMap((entry) => {
    const tag = dist.read(entry).match(/<html(?:\s[^>]*)?>/i)?.[0] ?? "";
    return BAKED_APP_STATE.filter((name) => tag.includes(name)).map(
      (name) => `${entry}: ${name}`
    );
  });

const emptyDeckRoots = (dist, shellSlugs = premiumDeckSlugList()) =>
  deckDetailEntries(dist, shellSlugs).filter((entry) => EMPTY_ROOT.test(dist.read(entry)));

const hasCapturedStyles = (html) =>
  [...html.matchAll(/<style\b[^>]*data-styled[^>]*>([\s\S]*?)<\/style>/gi)].some(
    (match) => match[1].trim() !== ""
  );

const uncapturedDeckStyles = (dist, shellSlugs = premiumDeckSlugList()) =>
  deckDetailEntries(dist, shellSlugs).filter((entry) => !hasCapturedStyles(dist.read(entry)));

module.exports = {
  emptyStyledTags,
  BAKED_APP_STATE,
  bakedAppState,
  emptyDeckRoots,
  hasCapturedStyles,
  uncapturedDeckStyles,
};
