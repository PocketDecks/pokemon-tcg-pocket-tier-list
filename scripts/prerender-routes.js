// scripts/prerender-routes.js
//
// Renders the SPA's static routes in headless Chromium and writes each result
// as <route>/index.html inside the build output, mirroring what Firebase
// Hosting's rewrite rule serves to crawlers. Replaces react-snap, which is
// unmaintained and cannot parse Vite's <script type="module"> markup.
// Deck detail pages are stamped separately by prerender-decks.js.
const fs = require("fs");
const http = require("http");
const path = require("path");
const puppeteer = require("puppeteer");
const { stampHead } = require("./meta-stamp");

const ROOT = path.join(__dirname, "..");
// BUILD_DIR allows an alternative Vite output directory for this script.
const DIST_DIR = process.env.BUILD_DIR
  ? path.resolve(process.env.BUILD_DIR)
  : path.join(ROOT, "dist");
const PORT = 4173;
const ORIGIN = `http://127.0.0.1:${PORT}`;
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

const captureAfterRouteReady = async (page, route, capture) => {
  if (ROUTE_READY_ROUTES.has(route)) {
    await page.waitForFunction(
      () => document.documentElement.dataset.routeReady === window.location.pathname,
      { timeout: 20000 }
    );
  }
  return capture();
};

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webp": "image/webp",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain",
  ".xml": "application/xml",
  ".map": "application/json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

// Serves the output dir with SPA fallback so each client-side route boots at
// its own URL and react-router sees the right location.
const startServer = (templateHtml) =>
  new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(new URL(req.url, ORIGIN).pathname);
      let filePath = path.join(DIST_DIR, urlPath);
      if (!filePath.startsWith(DIST_DIR)) {
        res.writeHead(403);
        return res.end();
      }
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(DIST_DIR, "index.html");
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        "Content-Type": MIME[ext] || "application/octet-stream",
      });
      if (path.basename(filePath) === "index.html") return res.end(templateHtml);
      fs.createReadStream(filePath).pipe(res);
    });
    server.listen(PORT, "127.0.0.1", () => resolve(server));
  });

const resetPrerenderTheme = (originalThemeColor) => {
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.style.removeProperty("color-scheme");
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    "content",
    originalThemeColor
  );
};

const resetPrerenderAppState = () => {
  const root = document.documentElement;
  root.removeAttribute("data-app-visible");
  root.style.removeProperty("--ad-anchor-h");
  root.style.removeProperty("--consent-banner-h");
};

const main = async () => {
  const indexPath = path.join(DIST_DIR, "index.html");
  if (!fs.existsSync(indexPath)) {
    console.error(`No index.html in ${DIST_DIR}; run \`yarn build\` first.`);
    process.exit(1);
  }
  const templateHtml = fs.readFileSync(indexPath, "utf8");
  const templateThemeColor =
    templateHtml.match(/<meta\s+name=["']theme-color["']\s+content=["']([^"']*)["']/i)?.[1] ?? "#121210";
  const templatePreloads = [...templateHtml.matchAll(/<link\b[^>]*>/gi)]
    .map((match) => match[0])
    .filter((tag) => /rel=["']modulepreload["']/i.test(tag))
    .map((tag) => (tag.match(/href=["']([^"']*)["']/i) || [])[1])
    .filter((href) => href !== undefined);
  const templateScripts = [
    ...templateHtml.matchAll(/<script\b[^>]*\bsrc=["']([^"']*)["'][^>]*>/gi),
  ].map((match) => match[1]);
  const server = await startServer(templateHtml);
  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.setUserAgent("prerender-routes");
  const pageErrors = [];

  page.on("pageerror", (err) =>
    pageErrors.push(`${page.url()}: ${err.message}`)
  );

  // Third-party traffic (ads, Firebase, fonts) must neither hang the render
  // nor leak into the snapshot; this mirrors react-snap's
  // skipThirdPartyRequests. The external card DB is exempt: DecksContext gates
  // rendering on cardsLoading || decksLoading, so blocking it leaves every
  // route captured as "Loading..." forever.
  await page.setRequestInterception(true);
  const CARD_DB_ORIGIN = "https://raw.githubusercontent.com/chase-mew/pokemon-tcg-pocket-cards";
  page.on("request", (req) => {
    const url = req.url();
    if (url.startsWith(ORIGIN) || url.startsWith(CARD_DB_ORIGIN)) req.continue();
    else req.abort();
  });

  // Only the tier list paints deck anchors; other routes render their own
  // content without them. Waiting there would burn the full timeout per route,
  // and letting it fail silently would ship a "Loading..." snapshot if this
  // route's render ever regressed, so failure propagates instead.
  const DECK_ANCHOR_ROUTES = new Set(["/tier-list"]);
  for (const route of ROUTES) {
    await page.goto(`${ORIGIN}${route}`, { waitUntil: "networkidle0" });
    await page.waitForSelector("#app-root > *, #root > *");
    const html = await captureAfterRouteReady(page, route, async () => {
      if (DECK_ANCHOR_ROUTES.has(route)) {
        await page.waitForFunction(
          () => document.querySelectorAll('a[href^="/deck/"]').length > 10,
          { timeout: 20000 }
        );
      }
      await page.evaluate(() => {
        document.querySelectorAll("style[data-styled]").forEach((el) => {
          el.textContent = Array.from(el.sheet.cssRules, (rule) => rule.cssText).join("\n");
        });
      });
      await page.evaluate(
        (preloads, scripts) => {
          const allowedPreloads = new Set(preloads);
          const allowedScripts = new Set(scripts);
          document.querySelectorAll('link[rel="modulepreload"]').forEach((el) => {
            if (!allowedPreloads.has(el.getAttribute("href"))) el.remove();
          });
          document.querySelectorAll("script[src]").forEach((el) => {
            if (!allowedScripts.has(el.getAttribute("src"))) el.remove();
          });
        },
        templatePreloads,
        templateScripts
      );
      await page.evaluate(resetPrerenderTheme, templateThemeColor);
      await page.evaluate(resetPrerenderAppState);
      return page.evaluate(
        () => `<!doctype html>\n${document.documentElement.outerHTML}`
      );
    });
    // Vite stamps lazy-chunk hrefs with the preview origin while the page
    // boots; captured markup must stay root-relative.
    let stampedHtml = html.split(ORIGIN).join("");
    const meta = ROUTE_META[route];
    if (meta) {
      stampedHtml = stampHead(stampedHtml, meta);
    }
    const outFile =
      route === "/"
        ? path.join(DIST_DIR, "index.html")
        : path.join(DIST_DIR, route.slice(1), "index.html");
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, stampedHtml);
    console.log(`Prerendered ${route}`);
  }

  await browser.close();
  server.close();

  if (pageErrors.length > 0) {
    console.error(`Page errors during prerender:\n${pageErrors.join("\n")}`);
    process.exit(1);
  }
  console.log(`Prerendered ${ROUTES.length} routes into ${DIST_DIR}`);
};

if (require.main === module) main();

module.exports = { captureAfterRouteReady, resetPrerenderAppState, resetPrerenderTheme, ROUTE_READY_ROUTES, ROUTE_META, ROUTES };
