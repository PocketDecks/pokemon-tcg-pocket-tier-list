// scripts/verify-dist-html/expansions.js
// Expansion page and expansion list checks.
const { ROUTE_LOCALES } = require("../locale-route.mjs");
const { DELUXE_EXPANSION_IDS, expansionCode, newestExpansion } = require("../../src/app/expansion-policy.mjs");
const { expansionIndexPolicy } = require("../../src/app/expansion-index-policy.mjs");
const { hubHtmlIssues } = require("./hubs");
const { LOCALE_ENTRY_PREFIXES, loadDecks, localeEntryPrefix } = require("./shared");

const expansionPageIssues = (dist, expansions = loadExpansions(), decks = loadDecks()) => {
  const policy = expansionIndexPolicy(expansions, decks);
  const issues = [];
  for (const expansion of expansions.filter((entry) => !DELUXE_EXPANSION_IDS.has(entry.id))) {
    for (const prefix of LOCALE_ENTRY_PREFIXES) {
      const entry = `${prefix}expansion-list/${expansion.id}/index.html`;
      if (!dist.has(entry)) {
        issues.push(`${entry}: missing`);
        continue;
      }
      const html = dist.read(entry);
      const expectedRobots = policy.isIndexable(expansion.id) ? "index, follow" : "noindex, follow";
      issues.push(...hubHtmlIssues(entry, html, expectedRobots, expansionCode(expansion.id)));
      if (!html.includes(`"@type":"BreadcrumbList"`)) issues.push(`${entry}: missing BreadcrumbList JSON-LD`);
    }
  }
  return issues;
};

const loadExpansions = () =>
  require("pokemon-tcg-pocket-cards/data/v5/expansions.json");

const EXPANSION_LIST_ENTRY = "expansion-list/index.html";

const EXPANSIONS_OPTION_LABEL = Object.fromEntries(
  ROUTE_LOCALES.map((locale) => [
    `${localeEntryPrefix(locale)}${EXPANSION_LIST_ENTRY}`,
    require(`../../src/locales/${locale}_translation.json`).expansionList.viewExpansions,
  ])
);

const imageSrcs = (html) =>
  [...html.matchAll(/<img\b[^>]*\ssrc=["']([^"']*)["']/gi)].map((match) => match[1]);

const toggleButtons = (html) =>
  [...html.matchAll(/<button\b[^>]*\baria-pressed="(true|false)"[^>]*>([^<]*)<\/button>/gi)].map(
    (match) => ({ pressed: match[1], label: match[2] })
  );

const findDefaultViewIssues = (entry, html) => {
  const issues = [];
  const expansions = toggleButtons(html).find((button) => button.label === EXPANSIONS_OPTION_LABEL[entry]);
  if (!expansions) {
    issues.push(`${entry}: missing the Expansions option`);
  } else if (expansions.pressed !== "true") {
    issues.push(`${entry}: the Expansions option is not pressed by default`);
  }
  if (/href=["'][^"']*\?pack=/i.test(html)) {
    issues.push(`${entry}: a tile links to a pack filter`);
  }
  return issues;
};

const expansionListIssues = (dist, list = loadExpansions()) => {
  const sources = imageSrcs(dist.read(EXPANSION_LIST_ENTRY));
  const newest = newestExpansion(list);
  const issues = [];
  if (!newest) {
    issues.push(`${EXPANSION_LIST_ENTRY}: no eligible expansion`);
  } else if (!sources.some((src) => src.includes(`/packs/${newest.id}-`))) {
    issues.push(`${EXPANSION_LIST_ENTRY}: missing the newest set /packs/${newest.id}-`);
  }
  for (const id of DELUXE_EXPANSION_IDS) {
    if (sources.some((src) => src.includes(`/packs/${id}-`))) {
      issues.push(`${EXPANSION_LIST_ENTRY}: deluxe pack /packs/${id}- is listed`);
    }
  }
  for (const entry of Object.keys(EXPANSIONS_OPTION_LABEL)) {
    if (!dist.has(entry)) {
      issues.push(`${entry}: missing`);
    } else {
      issues.push(...findDefaultViewIssues(entry, dist.read(entry)));
    }
  }
  return issues;
};

module.exports = {
  expansionPageIssues,
  loadExpansions,
  EXPANSION_LIST_ENTRY,
  EXPANSIONS_OPTION_LABEL,
  imageSrcs,
  toggleButtons,
  findDefaultViewIssues,
  expansionListIssues,
};
