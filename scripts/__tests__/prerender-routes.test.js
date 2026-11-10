const test = require("node:test");
const assert = require("node:assert");
const { captureAfterRouteReady, NOT_FOUND_META, resetPrerenderAppState, resetPrerenderTheme, ROUTES, ROUTE_META, ROUTE_READY_ROUTES } = require("../prerender-routes");

test("the 404 page is noindex with a title and no canonical", () => {
  assert.strictEqual(NOT_FOUND_META.robots, "noindex");
  assert.ok(NOT_FOUND_META.title.length > 0);
  assert.strictEqual(NOT_FOUND_META.canonical, undefined);
});

test("every route has unique title and description, plus self canonical", () => {
  const titles = new Set();
  const descriptions = new Set();
  for (const route of ROUTES) {
    const meta = ROUTE_META[route];
    assert.ok(meta, `no metadata for ${route}`);
    assert.ok(meta.title.length >= 15 && meta.title.length <= 75, `bad title length for ${route}: ${meta.title.length}`);
    assert.ok(meta.description.length >= 70 && meta.description.length <= 165, `bad description length for ${route}: ${meta.description.length}`);
    assert.strictEqual(meta.canonical, `https://pocketdecks.top${route === "/" ? "/" : route + "/"}`);
    titles.add(meta.title);
    descriptions.add(meta.description);
  }
  assert.strictEqual(titles.size, ROUTES.length, "duplicate titles across routes");
  assert.strictEqual(descriptions.size, ROUTES.length, "duplicate descriptions across routes");
});

test("waits for route content on data-backed pages", () => {
  assert.deepStrictEqual([...ROUTE_READY_ROUTES], ["/", "/cards-list", "/statistics", "/deck"]);
});

const { alternatesFor, localeMetaFor } = require("../prerender-routes");

test("every locale route carries a complete, reciprocal hreflang set", () => {
  for (const route of ROUTES) {
    const alternates = alternatesFor(route);
    assert.deepStrictEqual(
      alternates.map((a) => a.hreflang),
      ["en", "ja", "x-default"]
    );
    for (const alternate of alternates) {
      assert.ok(
        alternate.href.startsWith("https://pocketdecks.top/"),
        `alternate is not absolute: ${alternate.href}`
      );
    }
    assert.strictEqual(alternates.find((a) => a.hreflang === "x-default").href, alternates[0].href);
  }
});

test("each locale canonical matches its own hreflang entry", () => {
  for (const route of ROUTES) {
    const en = localeMetaFor("en", route);
    const ja = localeMetaFor("ja", route);
    assert.ok(en.alternates.some((a) => a.hreflang === "en" && a.href === en.canonical));
    assert.ok(ja.alternates.some((a) => a.hreflang === "ja" && a.href === ja.canonical));
    assert.strictEqual(en.lang, "en");
    assert.strictEqual(ja.lang, "ja");
    assert.notStrictEqual(en.canonical, ja.canonical);
  }
});

test("route social metadata uses its final title, canonical and absolute image", () => {
  for (const [locale, route] of [["en", "/tier-list"], ["ja", "/cards-list"]]) {
    const meta = localeMetaFor(locale, route);
    assert.ok(meta.metas.some((tag) => tag.includes(`property="og:url" content="${meta.canonical}"`)));
    assert.ok(meta.metas.some((tag) => tag.includes(`property="og:title" content="${meta.title}"`)));
    assert.ok(meta.metas.some((tag) => /property="og:image" content="https:\/\//.test(tag)));
  }
});

test("the Japanese home page carries a WebSite block of its own", () => {
  const en = localeMetaFor("en", "/").jsonLd;
  const ja = localeMetaFor("ja", "/").jsonLd;
  assert.strictEqual(en.url, "https://pocketdecks.top/");
  assert.strictEqual(ja["@type"], "WebSite");
  assert.strictEqual(ja.url, "https://pocketdecks.top/ja/");
  assert.strictEqual(ja.inLanguage, "ja");
  assert.strictEqual(ja.name, en.name);
});

test("only the home page and expansion pages carry structured data, in either locale", () => {
  for (const route of ROUTES) {
    const expected = route === "/" || route.startsWith("/expansion-list/");
    for (const locale of ["en", "ja"]) {
      assert.strictEqual(
        localeMetaFor(locale, route).jsonLd !== undefined,
        expected,
        `${locale} ${route}`
      );
    }
  }
});

test("Japanese routes carry Japanese titles and descriptions", () => {
  const titles = new Set();
  const descriptions = new Set();
  for (const route of ROUTES) {
    const meta = localeMetaFor("ja", route);
    assert.ok(meta.title.length > 0 && meta.title.length <= 65, `ja title too long for ${route}: ${meta.title.length}`);
    assert.ok(/[\u3040-\u30ff\u4e00-\u9faf]/.test(meta.title), `ja title is not Japanese for ${route}`);
    assert.ok(/[\u3040-\u30ff\u4e00-\u9faf]/.test(meta.description), `ja description is not Japanese for ${route}`);
    titles.add(meta.title);
    descriptions.add(meta.description);
  }
  assert.strictEqual(titles.size, ROUTES.length, "duplicate ja titles across routes");
  assert.strictEqual(descriptions.size, ROUTES.length, "duplicate ja descriptions across routes");
});

test("Japanese canonicals sit under /ja and keep the trailing slash", () => {
  assert.strictEqual(localeMetaFor("ja", "/tier-list").canonical, "https://pocketdecks.top/ja/tier-list/");
  assert.strictEqual(localeMetaFor("ja", "/").canonical, "https://pocketdecks.top/ja/");
  assert.strictEqual(localeMetaFor("en", "/tier-list").canonical, "https://pocketdecks.top/tier-list/");
  assert.strictEqual(localeMetaFor("en", "/").canonical, "https://pocketdecks.top/");
});

test("removes runtime theme state before prerender capture", () => {
  const meta = {
    content: "#ff00ff",
    setAttribute: (_name, value) => {
      meta.content = value;
    },
    getAttribute: () => meta.content,
  };
  const classes = new Set(["c15t-dark", "app-shell"]);
  global.document = {
    documentElement: {
      dataset: { theme: "light" },
      classList: {
        remove: (...names) => names.forEach((name) => classes.delete(name)),
      },
      style: {
        colorScheme: "light",
        removeProperty: (name) => {
          if (name === "color-scheme") document.documentElement.style.colorScheme = "";
        },
      },
      removeAttribute: (name) => {
        if (name === "data-theme") delete document.documentElement.dataset.theme;
      },
    },
    querySelector: () => meta,
  };

  resetPrerenderTheme("#121210");

  assert.strictEqual(document.documentElement.dataset.theme, undefined);
  assert.deepStrictEqual([...classes], ["app-shell"]);
  assert.strictEqual(document.documentElement.style.colorScheme, "");
  assert.strictEqual(document.querySelector().getAttribute("content"), "#121210");
  delete global.document;
});
test("strips the live app state from the captured document", () => {
  const removed = [];
  global.document = {
    documentElement: {
      dataset: { routeReady: "/statistics" },
      removeAttribute: (name) => removed.push(name),
      style: { removeProperty: (name) => removed.push(name) },
    },
  };

  resetPrerenderAppState();

  assert.deepStrictEqual(removed, ["data-app-visible", "data-consent-pending", "--ad-anchor-h"]);
  assert.strictEqual("routeReady" in document.documentElement.dataset, false);
  delete global.document;
});
test("captures data-backed routes after their pathname is ready", async () => {
  const events = [];
  const page = {
    waitForFunction: async (predicate, options) => {
      events.push("wait");
      assert.strictEqual(options.timeout, 20000);
      global.document = { documentElement: { dataset: { routeReady: "/wrong" } } };
      global.window = { location: { pathname: "/statistics" } };
      assert.strictEqual(predicate(), false);
      global.document.documentElement.dataset.routeReady = "/statistics";
      assert.strictEqual(predicate(), true);
      events.push("ready");
    },
  };

  const html = await captureAfterRouteReady(page, "/statistics", () => {
    events.push("capture");
    return "<html></html>";
  });

  assert.strictEqual(html, "<html></html>");
  assert.deepStrictEqual(events, ["wait", "ready", "capture"]);
  delete global.document;
  delete global.window;
});

const { buildRouteMeta, buildJaRouteMeta, JA_ROUTE_META } = require("../prerender-routes");
const { stampHead } = require("../meta-stamp");
const { newestCoveredExpansion } = require("../../src/app/expansion-feed.mjs");
const expansionList = require("pokemon-tcg-pocket-cards/data/v5/expansions.min.json");

const STUB = { id: "x9", name: "Test Set", release_date: "2027-01-01" };

test("tier-list title names the newest expansion by name", () => {
  assert.strictEqual(
    buildRouteMeta(STUB)["/tier-list"].title,
    "Pokemon TCG Pocket Tier List: Best Test Set Decks | Top Pocket Decks"
  );
});

test("tier-list description names the expansion and says the list is ranked by power score from tournament data and updated four times a week", () => {
  const { description } = buildRouteMeta(STUB)["/tier-list"];
  assert.match(description, /Test Set/);
  assert.match(description, /ranked by power score from tournament data/);
  assert.match(description, /updated four times a week/);
});

test("stamped tier-list head carries one title and the expansion description", () => {
  const template = `<!doctype html><html><head><title>Template default</title></head><body></body></html>`;
  const meta = buildRouteMeta(STUB)["/tier-list"];
  const out = stampHead(template, { title: meta.title, description: meta.description });
  assert.deepStrictEqual(out.match(/<title\b[^>]*>[\s\S]*?<\/title>/gi), [
    "<title>Pokemon TCG Pocket Tier List: Best Test Set Decks | Top Pocket Decks</title>",
  ]);
  assert.match(out, /<meta name="description" content="[^"]*Test Set/);
});

test("Japanese tier-list title names the expansion", () => {
  assert.match(buildJaRouteMeta(STUB)["/tier-list"].title, /Test Set/);
  assert.match(buildJaRouteMeta(STUB)["/tier-list"].description, /Test Set/);
});

test("the shipped tier-list metadata names the newest listed expansion", () => {
  const latest = newestCoveredExpansion(expansionList, require("../../public/data/best-decks.json"));
  assert.ok(ROUTE_META["/tier-list"].title.includes(latest.name));
  assert.ok(ROUTE_META["/tier-list"].description.includes(latest.name));
});

test("the homepage title covers best decks and the tier list", () => {
  assert.strictEqual(
    buildRouteMeta(STUB)["/"].title,
    "Pokemon TCG Pocket Best Decks & Tier List | Top Pocket Decks"
  );
  assert.strictEqual(JA_ROUTE_META["/"].title.includes("最強デッキ"), true);
});

test("the homepage description names the newest expansion in both locales", () => {
  assert.match(buildRouteMeta(STUB)["/"].description, /Test Set/);
  assert.match(buildJaRouteMeta(STUB)["/"].description, /Test Set/);
});

test("the homepage keeps its canonical", () => {
  assert.strictEqual(buildRouteMeta(STUB)["/"].canonical, "https://pocketdecks.top/");
});

test("tier-list copy states the four-times-a-week refresh in both locales", () => {
  assert.match(ROUTE_META["/tier-list"].description, /updated four times a week/);
  assert.match(buildJaRouteMeta(STUB)["/tier-list"].description, /週4回/);
});

test("expansion names with regex punctuation are matched literally", () => {
  const stub = { id: "x9", name: "Set (A1)", release_date: "2027-01-01" };
  const meta = buildRouteMeta(stub);
  assert.ok(meta["/tier-list"].title.includes("Set (A1)"));
  assert.ok(meta["/tier-list"].description.includes("Set (A1)"));
});

test("tier-list descriptions describe what every visitor sees, with no filter or sort control", () => {
  const descriptions = [
    ROUTE_META["/tier-list"].description,
    JA_ROUTE_META["/tier-list"].description,
    buildRouteMeta(null)["/tier-list"].description,
    buildJaRouteMeta(null)["/tier-list"].description,
  ];
  for (const description of descriptions) {
    assert.doesNotMatch(description, /filter|sort|絞り込|並べ替|フィルター/i);
  }
  const en = ROUTE_META["/tier-list"].description;
  assert.match(en, /ranked by power score/);
  assert.match(en, /Tiers, win rates, matchups/);
  const ja = JA_ROUTE_META["/tier-list"].description;
  assert.match(ja, /パワースコア/);
  assert.match(ja, /ティア/);
});

test("with no covered expansion the tier-list and homepage copy is generic", () => {
  const meta = buildRouteMeta(null);
  assert.strictEqual(meta["/tier-list"].title, "Pokemon TCG Pocket Tier List: Best Decks | Top Pocket Decks");
  assert.doesNotMatch(meta["/tier-list"].description, /for /);
  assert.strictEqual(meta["/"].title, "Pokemon TCG Pocket Best Decks & Tier List | Top Pocket Decks");
  assert.doesNotMatch(meta["/"].description, /for /);
  const ja = buildJaRouteMeta(null);
  assert.strictEqual(ja["/tier-list"].title, "ポケポケ ティアリスト 最強デッキ一覧 | Top Pocket Decks");
  assert.doesNotMatch(ja["/"].description, /のデッキ/);
});

test("shipped copy names the expansion the decks feed covers", () => {
  const decks = require("../../public/data/best-decks.json");
  const covered = newestCoveredExpansion(expansionList, decks);
  assert.ok(covered);
  assert.ok(ROUTE_META["/tier-list"].title.includes(covered.name));
  assert.ok(ROUTE_META["/"].description.includes(covered.name));
});

test("a 30-character expansion name keeps name-bearing titles and descriptions within limits in both locales", () => {
  const LONG = "Abcdefghijklmnopqrstuvwxyzabcd";
  assert.strictEqual(LONG.length, 30);
  const en = buildRouteMeta({ id: "x9", name: LONG });
  const ja = buildJaRouteMeta({ id: "x9", name: LONG });
  for (const meta of [en["/"], en["/tier-list"], ja["/"], ja["/tier-list"]]) {
    assert.ok(meta.title.length >= 15 && meta.title.length <= 75, `title ${meta.title.length}: ${meta.title}`);
    assert.ok(meta.description.length >= 70 && meta.description.length <= 165, `description ${meta.description.length}: ${meta.description}`);
  }
  assert.ok(en["/tier-list"].title.includes(LONG));
});

test("expansion titles drop Best and fall back when the full title is too long", () => {
  assert.strictEqual(
    ROUTE_META["/expansion-list/c1"].title,
    "Pokemon TCG Pocket Dual Fusion (C1): Cards & Decks | Top Pocket Decks"
  );
  assert.strictEqual(
    ROUTE_META["/expansion-list/b4a"].title,
    "Team Rocket's Ambition (B4a) Cards & Decks | Top Pocket Decks"
  );
  for (const route of ROUTES.filter((value) => value.startsWith("/expansion-list/"))) {
    assert.doesNotMatch(ROUTE_META[route].title, /Best/);
  }
});

test("expansion pages carry a BreadcrumbList of Home, Expansions and the set", () => {
  assert.deepStrictEqual(localeMetaFor("en", "/expansion-list/c1").jsonLd, {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://pocketdecks.top/" },
      { "@type": "ListItem", position: 2, name: "Expansions", item: "https://pocketdecks.top/expansion-list/" },
      { "@type": "ListItem", position: 3, name: "Dual Fusion", item: "https://pocketdecks.top/expansion-list/c1/" },
    ],
  });
  assert.deepStrictEqual(localeMetaFor("ja", "/expansion-list/c1").jsonLd.itemListElement.map((item) => item.name), [
    "ホーム",
    "拡張パック",
    "Dual Fusion",
  ]);
  assert.strictEqual(
    localeMetaFor("ja", "/expansion-list/c1").jsonLd.itemListElement[2].item,
    "https://pocketdecks.top/ja/expansion-list/c1/"
  );
});

test("expansion breadcrumb labels equal the locale file values", () => {
  const en = require("../../src/locales/en_translation.json").expansionPage;
  const ja = require("../../src/locales/ja_translation.json").expansionPage;
  const enItems = localeMetaFor("en", "/expansion-list/c1").jsonLd.itemListElement;
  assert.strictEqual(enItems[0].name, en.home);
  assert.strictEqual(enItems[1].name, en.expansions);
  const jaItems = localeMetaFor("ja", "/expansion-list/c1").jsonLd.itemListElement;
  assert.strictEqual(jaItems[0].name, ja.home);
  assert.strictEqual(jaItems[1].name, ja.expansions);
});
