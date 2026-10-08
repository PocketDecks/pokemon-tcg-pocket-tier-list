// scripts/prerender-decks.js
const fs = require("fs");
const path = require("path");
const { stampHead, escapeXml } = require("./meta-stamp");

const SITE_URL = "https://pocketdecks.top";
const ROOT = path.join(__dirname, "..");
const BUILD_DIR = process.env.BUILD_DIR
  ? path.resolve(process.env.BUILD_DIR)
  : path.join(ROOT, "dist");
const DATA_FILE = path.join(ROOT, "public", "data", "best-decks.json");

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


const renderDeckHtml = (deck, templateHtml) => {
  const { slug, title, ogImage, ogUrl, description, cardId } = deck;

  const eTitle = escapeXml(title);
  const eDesc = escapeXml(description);

  let html = templateHtml;
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

const main = () => {
  if (!fs.existsSync(BUILD_DIR)) {
    console.error("Build output not found; run `yarn build` first.");
    process.exit(1);
  }
  const template = fs.readFileSync(path.join(BUILD_DIR, "index.html"), "utf8");
  const decks = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

  let count = 0;
  for (const deck of decks) {
    const slug = slugFor(deck.name);
    const name = friendlyName(deck.name);
    const title = `${name} | Pokémon TCG Pocket Deck Stats and Matchups`;
    const description = `Pokémon TCG Pocket deck profile for ${name}: card list, matchups, and win rate.`;
    const ogImage = `${SITE_URL}/og/deck/${slug}.png`;
    const ogUrl = `${SITE_URL}/deck/${slug}`;
    const cardId = firstBestListCardId(deck);

    const html = renderDeckHtml(
      { slug, title, ogImage, ogUrl, description, cardId },
      template
    );
    const outDir = path.join(BUILD_DIR, "deck", slug);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "index.html"), html);
    count += 1;
  }
  console.log(`Prerendered ${count} deck pages into ${BUILD_DIR}/deck/`);
};

if (require.main === module) {
  main();
}

module.exports = { renderDeckHtml, friendlyName, slugFor };
