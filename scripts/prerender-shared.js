const fs = require("fs");
const http = require("http");
const path = require("path");
const puppeteer = require("puppeteer");

const PORT = 4173;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const PRERENDER_USER_AGENT = "prerender-routes";
const ROUTE_READY_TIMEOUT = 20000;
const CARD_DB_ORIGIN = "https://raw.githubusercontent.com/chase-mew/pokemon-tcg-pocket-cards";

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

const startServer = (distDir, templateHtml) =>
  new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(new URL(req.url, ORIGIN).pathname);
      let filePath = path.join(distDir, urlPath);
      if (!filePath.startsWith(distDir)) {
        res.writeHead(403);
        return res.end();
      }
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(distDir, "index.html");
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

const readTemplate = (html) => ({
  html,
  themeColor:
    html.match(/<meta\s+name=["']theme-color["']\s+content=["']([^"']*)["']/i)?.[1] ?? "#121210",
  preloads: [...html.matchAll(/<link\b[^>]*>/gi)]
    .map((match) => match[0])
    .filter((tag) => /rel=["']modulepreload["']/i.test(tag))
    .map((tag) => (tag.match(/href=["']([^"']*)["']/i) || [])[1])
    .filter((href) => href !== undefined),
  scripts: [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']*)["'][^>]*>/gi)].map(
    (match) => match[1]
  ),
});

const resetPrerenderTheme = (originalThemeColor) => {
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.classList.remove("c15t-dark", "c15t-light");
  document.documentElement.style.removeProperty("color-scheme");
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    "content",
    originalThemeColor
  );
};

const resetPrerenderAppState = () => {
  const root = document.documentElement;
  delete root.dataset.routeReady;
  root.removeAttribute("data-app-visible");
  root.removeAttribute("data-consent-pending");
  root.style.removeProperty("--ad-anchor-h");
  root.style.removeProperty("--consent-banner-h");
};

const launchBrowser = () =>
  puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

const createPrerenderPage = async (target, pageErrors) => {
  const page = await target.newPage();
  await page.setUserAgent(PRERENDER_USER_AGENT);
  page.on("pageerror", (err) =>
    pageErrors.push(`${page.url()}: ${err.message}`)
  );

  // Third-party traffic (ads, Firebase, fonts) must neither hang the render
  // nor leak into the snapshot; this mirrors react-snap's
  // skipThirdPartyRequests. The external card DB is exempt: DecksContext gates
  // rendering on cardsLoading || decksLoading, so blocking it leaves every
  // route captured as "Loading..." forever.
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const url = req.url();
    if (url.startsWith(ORIGIN) || url.startsWith(CARD_DB_ORIGIN)) req.continue();
    else req.abort();
  });
  return page;
};

const openDocument = async (page, route) => {
  await page.goto(`${ORIGIN}${route}`, { waitUntil: "networkidle0" });
  await page.waitForSelector("#app-root > *, #root > *");
};

const waitForRouteReady = (page) =>
  page.waitForFunction(
    () => document.documentElement.dataset.routeReady === window.location.pathname,
    { timeout: ROUTE_READY_TIMEOUT }
  );

const captureDocument = async (page, template) => {
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
    template.preloads,
    template.scripts
  );
  await page.evaluate(resetPrerenderTheme, template.themeColor);
  await page.evaluate(resetPrerenderAppState);
  const html = await page.evaluate(
    () => `<!doctype html>\n${document.documentElement.outerHTML}`
  );
  // Vite stamps lazy-chunk hrefs with the preview origin while the page
  // boots; captured markup must stay root-relative.
  return html.split(ORIGIN).join("");
};

const mapWithConcurrency = async (items, concurrency, worker) => {
  const queue = [...items];
  let failure = null;
  const lanes = Array.from(
    { length: Math.min(concurrency, items.length) },
    async (_, lane) => {
      while (queue.length > 0 && failure === null) {
        const item = queue.shift();
        try {
          await worker(item, lane);
        } catch (err) {
          failure = err;
          queue.length = 0;
        }
      }
    }
  );
  await Promise.all(lanes);
  if (failure !== null) throw failure;
};

module.exports = {
  captureDocument,
  createPrerenderPage,
  launchBrowser,
  mapWithConcurrency,
  openDocument,
  ORIGIN,
  PORT,
  readTemplate,
  resetPrerenderAppState,
  resetPrerenderTheme,
  startServer,
  waitForRouteReady,
};
