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
const { localeRoute, localizedUrl, ROUTE_LOCALES } = require("./locale-route.mjs");
const { SITE_URL } = require("./meta-stamp");
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

const DEFAULT_LOCALE = "en";

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

// Titles are written for a Japanese reader searching for ポケポケ deck rankings,
// not translated word for word from the English.
const JA_ROUTE_META = {
  "/": {
    title: "ポケポケ 最強デッキ ティアリスト | Top Pocket Decks",
    description: "大会結果から作ったポケモンカードゲーム ポケットのティアリストです。最新環境のデッキランキング、勝率、相性を確認できます。",
  },
  "/tier-list": {
    title: "ポケポケ ティアリスト 最強デッキ一覧 | Top Pocket Decks",
    description: "大会データをもとに全アーキタイプを毎日ランク付けしています。拡張パック、エネルギー、勝率で絞り込んで最強デッキを探せます。",
  },
  "/cards-list": {
    title: "ポケポケ カード ティアリスト 最強カード | Top Pocket Decks",
    description: "実際に勝てるポケモンカードゲーム ポケットのカードをランキング形式で紹介します。大会のデッキリストからスコアを算出しています。",
  },
  "/expansion-list": {
    title: "ポケポケ 拡張パック一覧と収録カード | Top Pocket Decks",
    description: "ポケモンカードゲーム ポケットの全拡張パックをカード枚数と環境への影響つきでまとめています。最強の遺伝子から収録しています。",
  },
  "/statistics": {
    title: "ポケポケ 環境統計とメタ推移 | Top Pocket Decks",
    description: "大会結果から集計したポケモンカードゲーム ポケットのメタシェア、週ごとのデッキ順位変動、相性データを掲載しています。",
  },
  "/deck": {
    title: "ポケポケ デッキ一覧とデッキレシピ | Top Pocket Decks",
    description: "ランク付けされたポケモンカードゲーム ポケットのデッキを一覧で紹介します。デッキリスト、相性、勝率をデッキごとに確認できます。",
  },
  "/about": {
    title: "Top Pocket Decksについて 集計方法とデータ | Top Pocket Decks",
    description: "Top Pocket DecksがLimitlessの大会データからポケモンカードゲーム ポケットのデッキをどうランク付けしているかを説明します。",
  },
  "/privacy": {
    title: "プライバシーポリシー | Top Pocket Decks",
    description: "Top Pocket Decksにおけるアクセス解析、広告、アカウントデータの取り扱いについて説明します。",
  },
};

const urlFor = (locale, route) => localizedUrl(SITE_URL, locale, route);

const alternatesFor = (route) => [
  ...ROUTE_LOCALES.map((locale) => ({ hreflang: locale, href: urlFor(locale, route) })),
  { hreflang: "x-default", href: urlFor(DEFAULT_LOCALE, route) },
];

const localeMetaFor = (locale, route) => {
  const base = ROUTE_META[route];
  const translated = locale === DEFAULT_LOCALE ? undefined : JA_ROUTE_META[route];
  return {
    title: translated?.title ?? base.title,
    description: translated?.description ?? base.description,
    canonical: urlFor(locale, route),
    lang: locale,
    alternates: alternatesFor(route),
    jsonLd: locale === DEFAULT_LOCALE ? base.jsonLd : undefined,
  };
};

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

    for (const locale of ROUTE_LOCALES) {
      await page.setExtraHTTPHeaders({
        "Accept-Language": locale === DEFAULT_LOCALE ? "en-GB,en;q=0.9" : `${locale},${locale}-JP;q=0.9`,
      });
      for (const route of ROUTES) {
        const url = localeRoute(locale, route);
        await openDocument(page, url);
        const html = await captureAfterRouteReady(page, route, async () => {
          if (DECK_ANCHOR_ROUTES.has(route)) {
            await page.waitForFunction(
              () => document.querySelectorAll('a[href*="/deck/"]').length > 10,
              { timeout: 20000 }
            );
          }
          return captureDocument(page, template);
        });
        const meta = localeMetaFor(locale, route);
        const outFile =
          url === "/"
            ? path.join(DIST_DIR, "index.html")
            : path.join(DIST_DIR, url.slice(1), "index.html");
        fs.mkdirSync(path.dirname(outFile), { recursive: true });
        fs.writeFileSync(outFile, stampHead(html, meta));
        console.log(`Prerendered ${url}`);
      }
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
  console.log(`Prerendered ${ROUTES.length * ROUTE_LOCALES.length} routes into ${DIST_DIR}`);
};

if (require.main === module) main();

module.exports = { alternatesFor, captureAfterRouteReady, DEFAULT_LOCALE, JA_ROUTE_META, localeMetaFor, NOT_FOUND_META, resetPrerenderAppState, resetPrerenderTheme, ROUTE_READY_ROUTES, ROUTE_META, ROUTES };
