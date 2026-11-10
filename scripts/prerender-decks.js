// scripts/prerender-decks.js
const fs = require("fs");
const path = require("path");
const { stampHead, escapeXml } = require("./meta-stamp");
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

const SITE_URL = "https://pocketdecks.top";
const ROOT = path.join(__dirname, "..");
const { localeRoute, localizedUrl, ROUTE_LOCALES } = require("./locale-route.mjs");
const DEFAULT_LOCALE = "en";
const {
  friendlyName,
  JA_DECK_DESCRIPTION_SUFFIX,
  JA_DECK_TITLE_SUFFIX,
  JA_HOME_LABEL,
  JA_TIER_LIST_LABEL,
} = require("./deck-friendly-name.mjs");
const BUILD_DIR = process.env.BUILD_DIR
  ? path.resolve(process.env.BUILD_DIR)
  : path.join(ROOT, "dist");
const DATA_FILE = path.join(ROOT, "public", "data", "best-decks.json");
const ARCHIVE_FILE = path.join(ROOT, "public", "data", "deck-archive.json");
const DECK_CONCURRENCY = 8;

const { deckSlug } = require("./deck-slug.mjs");
const { englishDeckHead } = require("./deck-head-copy.mjs");
const { loadPremiumDeckSlugs } = require("./premium-deck-slugs.mjs");
const { hubDisplayName } = require("./deck-archetype.mjs");
const { cardThumbSrcSet, DECK_CARD_SIZES, firstBestListCardId } = require("./deck-thumbs.mjs");

const slugFor = deckSlug;

const renderDeckHtml = (deck, documentHtml, locale = DEFAULT_LOCALE) => {
  const { slug, name, title, ogImage, description, cardId } = deck;

  const translated = locale !== DEFAULT_LOCALE;
  const localeTitle = translated ? `${name} ${JA_DECK_TITLE_SUFFIX}` : title;
  const localeDescription = translated ? `${name}${JA_DECK_DESCRIPTION_SUFFIX}` : description;

  const eTitle = escapeXml(localeTitle);
  const eDesc = escapeXml(localeDescription);
  const canonical = localizedUrl(SITE_URL, locale, `/deck/${slug}`);
  const deckUrl = (other) => localizedUrl(SITE_URL, other, `/deck/${slug}`);

  let html = documentHtml;
  const indexable = locale === DEFAULT_LOCALE;
  html = stampHead(html, {
    title: localeTitle,
    description: localeDescription,
    canonical,
    lang: locale,
    robots: indexable ? undefined : "noindex, follow",
    alternates: indexable
      ? [
          { hreflang: DEFAULT_LOCALE, href: deckUrl(DEFAULT_LOCALE) },
          { hreflang: "x-default", href: deckUrl(DEFAULT_LOCALE) },
        ]
      : [],
    metas: [
      `<meta property="og:type" content="website" />`,
      `<meta property="og:title" content="${eTitle}" />`,
      `<meta property="og:description" content="${eDesc}" />`,
      `<meta property="og:image" content="${escapeXml(ogImage)}" />`,
      `<meta property="og:url" content="${escapeXml(canonical)}" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:title" content="${eTitle}" />`,
      `<meta name="twitter:description" content="${eDesc}" />`,
      `<meta name="twitter:image" content="${escapeXml(ogImage)}" />`,
      ...(cardId === null
        ? []
        : [`<link rel="preload" as="image" imagesrcset="${escapeXml(cardThumbSrcSet(cardId))}" imagesizes="${escapeXml(DECK_CARD_SIZES)}" fetchpriority="high" />`]),
    ],
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: translated ? JA_HOME_LABEL : "Home",
          item: localizedUrl(SITE_URL, locale, "/"),
        },
        {
          "@type": "ListItem",
          position: 2,
          name: translated ? JA_TIER_LIST_LABEL : "Tier List",
          item: localizedUrl(SITE_URL, locale, "/tier-list"),
        },
        ...(deck.hub
          ? [{ "@type": "ListItem", position: 3, name: deck.hub.name, item: localizedUrl(SITE_URL, locale, `/deck/${deck.hub.slug}`) }]
          : []),
        { "@type": "ListItem", position: deck.hub ? 4 : 3, name },
      ],
    },
  });
  return html;
};

const hubFor = (archive, slug) => {
  const entry = archive.find((candidate) => candidate.variant === slug);
  if (!entry) return null;
  const entries = archive.filter((candidate) => candidate.hub === entry.hub);
  return { slug: entry.hub, name: hubDisplayName(entries) };
};

const deckJob = (deck, archive = []) => {
  const slug = slugFor(deck.name);
  const name = friendlyName(deck.name);
  const head = englishDeckHead(name);
  return {
    slug,
    name,
    hub: hubFor(archive, slug),
    title: head.title,
    description: head.description,
    ogImage: `${SITE_URL}/og/deck/${slug}.png`,
    cardId: firstBestListCardId(deck),
  };
};

const jobsForLiveDecks = (decks, archive = []) => decks.map((deck) => deckJob(deck, archive));

const renderDeckPage = async (page, job, template, locale = DEFAULT_LOCALE) => {
  await openDocument(page, `${localeRoute(locale, `/deck/${job.slug}`)}/`);
  await waitForRouteReady(page);
  const documentHtml = await captureDocument(page, template);
  return renderDeckHtml(job, documentHtml, locale);
};

const writeDeckPage = (job, html, locale = DEFAULT_LOCALE) => {
  const outDir = path.join(BUILD_DIR, localeRoute(locale, `/deck/${job.slug}`).replace(/^\//, ""));
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "index.html"), html);
};

const premiumShellHtml = (templateHtml, locale = DEFAULT_LOCALE) =>
  stampHead(templateHtml.replace(/<link\b[^>]*\brel=["']canonical["'][^>]*>/gi, ""), {
    robots: "noindex",
    lang: locale,
    alternates: [],
  });

const premiumShellPages = (slugs, liveSlugs) => {
  const clashes = slugs.filter((slug) => liveSlugs.has(slug));
  if (clashes.length > 0) {
    throw new Error(`Premium-only deck slugs that are also live: ${clashes.join(", ")}`);
  }
  return ROUTE_LOCALES.flatMap((locale) =>
    slugs.map((slug) => ({ slug, locale, route: localeRoute(locale, `/deck/${slug}`) }))
  );
};

const writePremiumShells = (buildDir, templateHtml, pages) => {
  for (const { locale, route } of pages) {
    const outDir = path.join(buildDir, route.replace(/^\//, ""));
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "index.html"), premiumShellHtml(templateHtml, locale));
  }
};

const main = async () => {
  if (!fs.existsSync(BUILD_DIR)) {
    console.error("Build output not found; run `yarn build` first.");
    process.exit(1);
  }
  const template = readTemplate(fs.readFileSync(path.join(BUILD_DIR, "index.html"), "utf8"));
  const archive = JSON.parse(fs.readFileSync(ARCHIVE_FILE, "utf8"));
  const liveDecks = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  const jobs = jobsForLiveDecks(liveDecks, archive);
  const shellPages = premiumShellPages(
    Object.keys(loadPremiumDeckSlugs()),
    new Set(liveDecks.map((deck) => slugFor(deck.name)))
  );

  const server = await startServer(BUILD_DIR, template.html);
  const browser = await launchBrowser();
  const pageErrors = [];
  const contexts = [];
  try {
    const pages = await Promise.all(
      Array.from({ length: Math.min(DECK_CONCURRENCY, jobs.length) }, async () => {
        const context = await browser.createBrowserContext();
        contexts.push(context);
        return createPrerenderPage(context, pageErrors);
      })
    );
    await mapWithConcurrency(jobs, pages.length, async (job, lane) => {
      try {
        for (const locale of ROUTE_LOCALES) {
          writeDeckPage(job, await renderDeckPage(pages[lane], job, template, locale), locale);
        }
      } catch (err) {
        throw new Error(`Deck ${job.slug} failed to render: ${err.message}`, { cause: err });
      }
    });
  } finally {
    await Promise.allSettled(contexts.map((context) => context.close()));
    await browser.close().finally(() => server.close());
  }

  if (pageErrors.length > 0) {
    throw new Error(`Page errors during deck prerender:\n${pageErrors.join("\n")}`);
  }
  writePremiumShells(BUILD_DIR, template.html, shellPages);
  console.log(`Prerendered ${jobs.length * ROUTE_LOCALES.length} deck pages into ${BUILD_DIR}/deck/`);
  console.log(`Wrote ${shellPages.length} premium deck shells into ${BUILD_DIR}/deck/`);
};

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = {
  deckJob,
  jobsForLiveDecks,
  DECK_CONCURRENCY,
  renderDeckHtml,
  premiumShellHtml,
  premiumShellPages,
  writePremiumShells,
  friendlyName,
  slugFor,
};
