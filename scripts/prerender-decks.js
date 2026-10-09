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
const BUILD_DIR = process.env.BUILD_DIR
  ? path.resolve(process.env.BUILD_DIR)
  : path.join(ROOT, "dist");
const DATA_FILE = path.join(ROOT, "public", "data", "best-decks.json");
const DECK_CONCURRENCY = 8;

const isEx = (name) => /\bex$/i.test(name.trim());

const deckNameFromId = (id) => {
  const parts = id.split("-");
  const nameWords = parts.slice(0, -2);
  return nameWords
    .map((w) =>
      w.toLowerCase() === "ex" ? "ex" : w.charAt(0).toUpperCase() + w.slice(1)
    )
    .join(" ");
};

const friendlyName = (deckName) => {
  const names = deckName.split("&").map((p) => deckNameFromId(p.trim()));
  names.sort((a, b) => Number(isEx(b)) - Number(isEx(a)));
  return names.join(" & ");
};

const { deckSlug } = require("./deck-slug.mjs");
const { cardThumbSrcSet, DECK_CARD_SIZES, firstBestListCardId } = require("./deck-thumbs.mjs");

const slugFor = deckSlug;

const renderDeckHtml = (deck, documentHtml) => {
  const { slug, title, ogImage, ogUrl, description, cardId } = deck;

  const eTitle = escapeXml(title);
  const eDesc = escapeXml(description);

  let html = documentHtml;
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${eTitle}</title>`);
  html = stampHead(html, {
    description,
    canonical: `${SITE_URL}/deck/${slug}/`,
    metas: [
      `<meta property="og:type" content="website" />`,
      `<meta property="og:title" content="${eTitle}" />`,
      `<meta property="og:description" content="${eDesc}" />`,
      `<meta property="og:image" content="${escapeXml(ogImage)}" />`,
      `<meta property="og:url" content="${escapeXml(ogUrl)}/" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:title" content="${eTitle}" />`,
      `<meta name="twitter:description" content="${eDesc}" />`,
      `<meta name="twitter:image" content="${escapeXml(ogImage)}" />`,
      `<link rel="preload" as="image" imagesrcset="${escapeXml(cardThumbSrcSet(cardId))}" imagesizes="${escapeXml(DECK_CARD_SIZES)}" fetchpriority="high" />`,
    ],
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: "Tier List", item: `${SITE_URL}/tier-list/` },
        { "@type": "ListItem", position: 3, name: title.split(" | ")[0] },
      ],
    },
  });
  return html;
};

const deckJob = (deck) => {
  const slug = slugFor(deck.name);
  const name = friendlyName(deck.name);
  return {
    slug,
    title: `${name} | Pokémon TCG Pocket Deck Stats and Matchups`,
    description: `Pokémon TCG Pocket deck profile for ${name}: card list, matchups, and win rate.`,
    ogImage: `${SITE_URL}/og/deck/${slug}.png`,
    ogUrl: `${SITE_URL}/deck/${slug}`,
    cardId: firstBestListCardId(deck),
  };
};

const renderDeckPage = async (page, job, template) => {
  await openDocument(page, `/deck/${job.slug}/`);
  await waitForRouteReady(page);
  const documentHtml = await captureDocument(page, template);
  return renderDeckHtml(job, documentHtml);
};

const writeDeckPage = (job, html) => {
  const outDir = path.join(BUILD_DIR, "deck", job.slug);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "index.html"), html);
};

const main = async () => {
  if (!fs.existsSync(BUILD_DIR)) {
    console.error("Build output not found; run `yarn build` first.");
    process.exit(1);
  }
  const template = readTemplate(fs.readFileSync(path.join(BUILD_DIR, "index.html"), "utf8"));
  const jobs = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"))
    .map(deckJob)
    .filter((job) => job.cardId !== null);

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
        writeDeckPage(job, await renderDeckPage(pages[lane], job, template));
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
  console.log(`Prerendered ${jobs.length} deck pages into ${BUILD_DIR}/deck/`);
};

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = {
  deckJob,
  DECK_CONCURRENCY,
  renderDeckHtml,
  friendlyName,
  slugFor,
};
