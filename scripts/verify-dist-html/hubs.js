// scripts/verify-dist-html/hubs.js
// Deck hub page head and copy checks.
const { deckSlug } = require("../deck-slug.mjs");
const { shouldIndexHub } = require("../deck-archive-policy.mjs");
const { hubDisplayName } = require("../deck-archetype.mjs");
const { CANONICAL_TAG, LOCALE_ENTRY_PREFIXES, decodeXmlEntities, loadArchive, loadDecks } = require("./shared");

const metaContent = (html, name) => {
  const tag = (html.match(/<meta\b[^>]*>/gi) ?? []).find((candidate) =>
    new RegExp(`\\bname=["']${name}["']`, "i").test(candidate)
  );
  return tag === undefined ? [] : [decodeXmlEntities(tag.match(/\bcontent=["']([^"']*)["']/i)?.[1] ?? "")];
};

const hubHtmlIssues = (entry, html, expectedRobots, expectedName) => {
  const issues = [];
  const canonicals = html.match(CANONICAL_TAG) ?? [];
  if (canonicals.length !== 1) {
    issues.push(`${entry}: expected 1 canonical, found ${canonicals.length}`);
  }
  const robots = (html.match(/<meta\b[^>]*>/gi) ?? [])
    .filter((tag) => /\bname=["']robots["']/i.test(tag))
    .map((tag) => tag.match(/\bcontent=["']([^"']*)["']/i)?.[1] ?? "");
  if (robots.length !== 1 || robots[0] !== expectedRobots) {
    issues.push(`${entry}: robots ${robots.join(",") || "none"} is not ${expectedRobots}`);
  }
  const title = (html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? "").trim();
  const description = (metaContent(html, "description")[0] ?? "").trim();
  const h1 = (html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "").replace(/<[^>]+>/g, "").trim();
  if (!title) issues.push(`${entry}: empty title`);
  if (!description) issues.push(`${entry}: empty description`);
  if (!h1) issues.push(`${entry}: empty H1`);
  else if (!h1.includes(expectedName)) issues.push(`${entry}: H1 "${h1}" does not name ${expectedName}`);
  const jsonLd = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  for (const [label, text] of [["title", title], ["description", description], ["H1", h1], ["breadcrumb", jsonLd.join(" ")]]) {
    if (/\bundefined\b/.test(text)) issues.push(`${entry}: ${label} contains undefined`);
  }
  return issues;
};

// Archive hubs that no live deck shares a slug with. Only these get a hub page.
const archiveOnlyHubs = (archive = loadArchive(), decks = loadDecks()) => {
  const liveSlugs = new Set(decks.map((deck) => deckSlug(deck.name)));
  return [...new Set(archive.map((entry) => entry.hub))].filter((hub) => !liveSlugs.has(hub));
};

const hubPageIssues = (dist, archive = loadArchive(), decks = loadDecks()) => {
  const hubs = archiveOnlyHubs(archive, decks);
  return hubs.flatMap((hub) => {
    const entries = archive.filter((entry) => entry.hub === hub);
    const indexed = shouldIndexHub(entries);
    const name = hubDisplayName(entries);
    return LOCALE_ENTRY_PREFIXES.flatMap((prefix) => {
      const entry = `${prefix}deck/${hub}/index.html`;
      if (!dist.has(entry)) return [`${entry}: missing`];
      const expectedRobots = prefix === "" && indexed ? "index, follow" : "noindex, follow";
      return hubHtmlIssues(entry, dist.read(entry), expectedRobots, name);
    });
  });
};

module.exports = {
  metaContent,
  hubHtmlIssues,
  archiveOnlyHubs,
  hubPageIssues,
};
