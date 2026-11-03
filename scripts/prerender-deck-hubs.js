const fs = require("fs");
const path = require("path");
const { stampHead, escapeXml, SITE_URL } = require("./meta-stamp");
const { localizedUrl, ROUTE_LOCALES } = require("./locale-route.mjs");
const {
  captureDocument,
  createPrerenderPage,
  launchBrowser,
  mapWithConcurrency,
  openDocument,
  readTemplate,
  startServer,
  waitForRouteReady,
} = require("./prerender-shared");

const ROOT = path.join(__dirname, "..");
const BUILD_DIR = process.env.BUILD_DIR ? path.resolve(process.env.BUILD_DIR) : path.join(ROOT, "dist");
const ARCHIVE_FILE = path.join(ROOT, "public", "data", "deck-archive.json");
const DECKS_FILE = path.join(ROOT, "public", "data", "best-decks.json");
const HUB_CONCURRENCY = 8;
const archive = JSON.parse(fs.readFileSync(ARCHIVE_FILE, "utf8"));
const liveDecks = JSON.parse(fs.readFileSync(DECKS_FILE, "utf8"));
const deckSlug = (name) => name.toLowerCase().replace(/[^a-z0-9&\s-]/g, "").replace(/\s/g, "-").replace(/-+/g, "-");
const live = new Set(liveDecks.map((deck) => deckSlug(deck.name)));
const hubs = [...new Set(archive.map((entry) => entry.hub))].map((hub) => ({
  hub,
  entries: archive.filter((entry) => entry.hub === hub),
  live: archive.filter((entry) => entry.hub === hub && live.has(entry.variant)),
}));
const routeFor = (locale, hub) => localizedUrl(SITE_URL, locale, `/deck/${hub}`);

const renderHubHtml = (job, html, locale) => {
  const title = `${job.name} Deck | Pokemon TCG Pocket`;
  const description = job.live.length > 0
    ? `${job.name} Pokemon TCG Pocket deck variants, win rates and meta share from current tournament data.`
    : `${job.name} Pokemon TCG Pocket deck history. This archetype is not in the current meta.`;
  const canonical = routeFor(locale, job.hub);
  const alternates = [
    ...ROUTE_LOCALES.map((other) => ({ hreflang: other, href: routeFor(other, job.hub) })),
    { hreflang: "x-default", href: routeFor("en", job.hub) },
  ];
  const robots = job.live.length > 0 || job.entries.some((entry) => entry.lastSeen >= "2026-10-20")
    ? "index, follow"
    : "noindex, follow";
  return stampHead(html, {
    title,
    description,
    canonical,
    robots,
    lang: locale,
    alternates,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: localizedUrl(SITE_URL, locale, "/") },
        { "@type": "ListItem", position: 2, name: "Tier List", item: localizedUrl(SITE_URL, locale, "/tier-list") },
        { "@type": "ListItem", position: 3, name: job.name, item: canonical },
      ],
    },
    metas: [
      `<meta property="og:title" content="${escapeXml(title)}" />`,
      `<meta property="og:description" content="${escapeXml(description)}" />`,
      `<meta property="og:url" content="${escapeXml(canonical)}" />`,
    ],
  });
};

const main = async () => {
  if (!fs.existsSync(path.join(BUILD_DIR, "index.html"))) throw new Error(`No index.html in ${BUILD_DIR}`);
  const template = readTemplate(fs.readFileSync(path.join(BUILD_DIR, "index.html"), "utf8"));
  const server = await startServer(BUILD_DIR, template.html);
  const browser = await launchBrowser();
  const pageErrors = [];
  const contexts = [];
  try {
    const pages = await Promise.all(Array.from({ length: Math.min(HUB_CONCURRENCY, hubs.length) }, async () => {
      const context = await browser.createBrowserContext();
      contexts.push(context);
      return createPrerenderPage(context, pageErrors);
    }));
    await mapWithConcurrency(hubs, pages.length, async (job, lane) => {
      for (const locale of ROUTE_LOCALES) {
        const route = `/deck/${job.hub}`;
        await openDocument(pages[lane], `${locale === "en" ? "" : `/${locale}`}${route}/`);
        await waitForRouteReady(pages[lane]);
        const html = renderHubHtml(job, await captureDocument(pages[lane], template), locale);
        const output = path.join(BUILD_DIR, `${locale === "en" ? "" : `${locale}/`}${route.slice(1)}`, "index.html");
        fs.mkdirSync(path.dirname(output), { recursive: true });
        fs.writeFileSync(output, html);
      }
    });
  } finally {
    await Promise.allSettled(contexts.map((context) => context.close()));
    await browser.close().finally(() => server.close());
  }
  if (pageErrors.length > 0) throw new Error(`Page errors during hub prerender:\n${pageErrors.join("\n")}`);
  console.log(`Prerendered ${hubs.length * ROUTE_LOCALES.length} deck hubs into ${BUILD_DIR}`);
};

if (require.main === module) main().catch((error) => { console.error(error.message); process.exit(1); });
