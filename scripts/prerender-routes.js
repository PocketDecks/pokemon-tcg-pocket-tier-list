// scripts/prerender-routes.js
//
// Renders the SPA's static routes in headless Chromium and writes each result
// as <route>/index.html inside the build output, mirroring what Firebase
// Hosting's rewrite rule serves to crawlers. Replaces react-snap, which is
// unmaintained and cannot parse Vite's <script type="module"> markup.
// Deck detail pages are stamped separately by prerender-decks.js.
const fs = require("fs");
const path = require("path");
const { stampHead } = require("./meta-stamp");
const {
  captureDocument,
  createPrerenderPage,
  launchBrowser,
  openDocument,
  readTemplate,
  resetPrerenderAppState,
  resetPrerenderTheme,
  startServer,
  waitForRouteReady,
} = require("./prerender-shared");

const ROOT = path.join(__dirname, "..");
// BUILD_DIR allows an alternative Vite output directory for this script.
const DIST_DIR = process.env.BUILD_DIR
  ? path.resolve(process.env.BUILD_DIR)
  : path.join(ROOT, "dist");
const ROUTES = [
  "/",
  "/tier-list",
  "/cards-list",
  "/expansion-list",
  "/statistics",
  "/deck",
  "/about",
  "/privacy",
];

// Titles/descriptions are build-time constants: unique per route, keyword-led,
// en-UK. Canonicals always carry the trailing slash the server 301s to.
const ROUTE_META = {
  "/": {
    title: "Pokemon TCG Pocket Deck Tier List | Top Pocket Decks",
    description: "Pokemon TCG Pocket tier list built from real tournament results. See best deck rankings, win rates and matchups for the current expansion.",
    canonical: "https://pocketdecks.top/",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Top Pocket Decks",
      url: "https://pocketdecks.top/",
    },
  },
  "/tier-list": {
    title: "Pokemon TCG Pocket Tier List: Best Decks | Top Pocket Decks",
    description: "Every Pokemon TCG Pocket archetype ranked from tournament data, updated daily. Filter the tier list by expansion, energy type and win rate.",
    canonical: "https://pocketdecks.top/tier-list/",
  },
  "/cards-list": {
    title: "Pokemon TCG Pocket Card Tier List: Best Cards | Top Pocket Decks",
    description: "Which Pokemon TCG Pocket cards actually win games. Card rankings scored from tournament deck lists, refreshed with every pipeline run.",
    canonical: "https://pocketdecks.top/cards-list/",
  },
  "/expansion-list": {
    title: "Pokemon TCG Pocket Expansions & Set List | Top Pocket Decks",
    description: "All Pokemon TCG Pocket expansions with card counts and meta impact, tracked since Genetic Apex.",
    canonical: "https://pocketdecks.top/expansion-list/",
  },
  "/statistics": {
    title: "Pokemon TCG Pocket Meta Statistics & Trends | Top Pocket Decks",
    description: "Pokemon TCG Pocket meta share, weekly deck movement and matchup statistics computed from tournament results. See which decks are rising or falling.",
    canonical: "https://pocketdecks.top/statistics/",
  },
  "/deck": {
    title: "Browse Pokemon TCG Pocket Deck Profiles | Top Pocket Decks",
    description: "Every ranked Pokemon TCG Pocket deck with card lists, matchups and win rates. Pick an archetype to see its full profile.",
    canonical: "https://pocketdecks.top/deck/",
  },
  "/about": {
    title: "About Top Pocket Decks: Methodology & Data Sources",
    description: "How Top Pocket Decks ranks Pokemon TCG Pocket decks from Limitless tournament data, and who maintains the project.",
    canonical: "https://pocketdecks.top/about/",
  },
  "/privacy": {
    title: "Privacy Policy | Top Pocket Decks",
    description: "How Top Pocket Decks handles analytics, advertising and your account data.",
    canonical: "https://pocketdecks.top/privacy/",
  },
};

const ROUTE_READY_ROUTES = new Set(["/cards-list", "/statistics", "/deck"]);
const DECK_ANCHOR_ROUTES = new Set(["/tier-list"]);

const NOT_FOUND_ROUTE = "/404";
const NOT_FOUND_META = {
  title: "Page not found | Top Pocket Decks",
  description: "That page is not on Top Pocket Decks. Head back to the Pokemon TCG Pocket tier list for the current deck rankings.",
  robots: "noindex",
};

const captureAfterRouteReady = async (page, route, capture) => {
  if (ROUTE_READY_ROUTES.has(route)) {
    await waitForRouteReady(page);
  }
  return capture();
};

const main = async () => {
  const indexPath = path.join(DIST_DIR, "index.html");
  if (!fs.existsSync(indexPath)) {
    console.error(`No index.html in ${DIST_DIR}; run \`yarn build\` first.`);
    process.exit(1);
  }
  const template = readTemplate(fs.readFileSync(indexPath, "utf8"));
  fs.writeFileSync(
    path.join(DIST_DIR, "app-shell.html"),
    stampHead(template.html, { robots: "noindex" })
  );
  const server = await startServer(DIST_DIR, template.html);
  const browser = await launchBrowser();
  const pageErrors = [];
  try {
    const page = await createPrerenderPage(browser, pageErrors);

    for (const route of ROUTES) {
      await openDocument(page, route);
      const html = await captureAfterRouteReady(page, route, async () => {
        if (DECK_ANCHOR_ROUTES.has(route)) {
          await page.waitForFunction(
            () => document.querySelectorAll('a[href^="/deck/"]').length > 10,
            { timeout: 20000 }
          );
        }
        return captureDocument(page, template);
      });
      const meta = ROUTE_META[route];
      const stampedHtml = meta ? stampHead(html, meta) : html;
      const outFile =
        route === "/"
          ? path.join(DIST_DIR, "index.html")
          : path.join(DIST_DIR, route.slice(1), "index.html");
      fs.mkdirSync(path.dirname(outFile), { recursive: true });
      fs.writeFileSync(outFile, stampedHtml);
      console.log(`Prerendered ${route}`);
    }

    await openDocument(page, NOT_FOUND_ROUTE);
    await waitForRouteReady(page);
    const notFoundHtml = await captureDocument(page, template);
    fs.writeFileSync(
      path.join(DIST_DIR, "404.html"),
      stampHead(notFoundHtml, NOT_FOUND_META)
    );
  } finally {
    await browser.close().finally(() => server.close());
  }

  if (pageErrors.length > 0) {
    console.error(`Page errors during prerender:\n${pageErrors.join("\n")}`);
    process.exit(1);
  }
  console.log(`Prerendered ${ROUTES.length} routes into ${DIST_DIR}`);
};

if (require.main === module) main();

module.exports = { captureAfterRouteReady, NOT_FOUND_META, resetPrerenderAppState, resetPrerenderTheme, ROUTE_READY_ROUTES, ROUTE_META, ROUTES };
