// scripts/generate-sitemap.js
//
// Regenerates public/sitemap.xml from the current deck list plus the site's
// static routes. Run as a prebuild step so Vite copies the fresh file into
// dist/ automatically. Firebase Hosting serves static files under public/
// ahead of the SPA rewrite rule (firebase.json's "**" -> /index.html), so
// this is reachable at /sitemap.xml with no hosting config change.
const fs = require("fs");
const path = require("path");

const { deckSlug } = require("./deck-slug.mjs");
const { escapeXml, SITE_URL } = require("./meta-stamp");
const { localizedUrl, ROUTE_LOCALES } = require("./locale-route.mjs");

const STATIC_ROUTES = [
  "/",
  "/tier-list",
  "/cards-list",
  "/expansion-list",
  "/statistics",
  "/deck",
  "/about",
  "/privacy",
];

const DEFAULT_LOCALE = "en";

const urlFor = (locale, route) => localizedUrl(SITE_URL, locale, route);

const buildSitemap = ({ decks, staticRoutes = STATIC_ROUTES, lastmod }) => {
  // Trailing slashes match the canonical form stamped by the prerenderers;
  // the server 301s slashless paths, and sitemap/canonical must agree.
  const baseRoutes = [
    ...staticRoutes,
    ...decks.map((deck) => `/deck/${deckSlug(deck.name)}`),
  ];

  const alternateLines = (route) =>
    [
      ...ROUTE_LOCALES.map(
        (locale) =>
          `      <xhtml:link rel="alternate" hreflang="${escapeXml(locale)}" href="${escapeXml(urlFor(locale, route))}" />`
      ),
      `      <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(urlFor(DEFAULT_LOCALE, route))}" />`,
    ].join("\n");

  const urlEntries = baseRoutes
    .flatMap((route) => ROUTE_LOCALES.map((locale) => ({ route, locale })))
    .map(
      ({ route, locale }) =>
        `  <url>\n    <loc>${escapeXml(urlFor(locale, route))}</loc>\n    <lastmod>${lastmod}</lastmod>\n${alternateLines(route)}\n  </url>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urlEntries}
</urlset>
`;
};

const main = () => {
  const bestDecksPath = path.join(__dirname, "..", "public", "data", "best-decks.json");
  const bestDecks = JSON.parse(fs.readFileSync(bestDecksPath, "utf8"));
  const today = new Date().toISOString().split("T")[0];

  const sitemap = buildSitemap({ decks: bestDecks, lastmod: today });

  const outPath = path.join(__dirname, "..", "public", "sitemap.xml");
  fs.writeFileSync(outPath, sitemap);
  console.log(
    `Wrote ${(STATIC_ROUTES.length + bestDecks.length) * ROUTE_LOCALES.length} routes to ${outPath}`
  );
};

if (require.main === module) {
  main();
}

module.exports = { buildSitemap, escapeXml };
