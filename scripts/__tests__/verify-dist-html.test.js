const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const { createHash } = require("node:crypto");
const os = require("node:os");
const path = require("node:path");
const {
  findBakedAppState,
  findCanonicalIssues,
  findCspHashIssues,
  findShellPageIssues,
  findTitleCountIssues,
  findUnresolvedAppRoutes,
  findDeckImagePreloadIssues,
  findEmptyDeckRoots,
  findEmptyStyledTags,
  findExpansionListIssues,
  findExpansionPageIssues,
  findExternalScripts,
  findLoopbackRefs,
  findMissingCardThumbs,
  findMissingDeckThumbs,
  findMissingLiveDeckPages,
  findUncapturedDeckStyles,
  loadDecks,
  findModulepreloadDrift,
} = require("../verify-dist-html");

const makeDist = (files) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dist-"));
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  }
  return dir;
};

const PRELOAD = '<link rel="modulepreload" href="/assets/entry.js" />';

test("flags every loopback spelling in nested pages", () => {
  const dir = makeDist({
    "index.html": '<link rel="modulepreload" href="http://127.0.0.1:4173/assets/a.js" />',
    "deck/x/index.html": "<p>see http://localhost:4173/about</p>",
  });
  const refs = findLoopbackRefs(dir);
  assert.strictEqual(refs.length, 2);
  assert.ok(refs.some((r) => r.startsWith("index.html: http://127.0.0.1")));
  assert.ok(refs.some((r) => r.startsWith(`deck${path.sep}x${path.sep}index.html: http://localhost`)));
});

test("passes clean output untouched", () => {
  const dir = makeDist({
    "index.html":
      '<script type="module" src="/assets/index-CISid-uN.js"></script>' +
      '<link rel="canonical" href="https://pocketdecks.top/" />',
  });
  assert.deepStrictEqual(findLoopbackRefs(dir), []);
});

test("passes deck pages with prerendered roots", () => {
  const dir = makeDist({
    "deck/index.html": '<div id="root"></div>',
    "deck/x/index.html": '<div id="root"><main>Deck list</main></div>',
  });
  assert.deepStrictEqual(findEmptyDeckRoots(dir), []);
});

test("flags deck pages with empty roots", () => {
  const dir = makeDist({
    "deck/x/index.html": '<div id="root"></div>',
  });
  assert.deepStrictEqual(findEmptyDeckRoots(dir), [
    path.join("deck", "x", "index.html"),
  ]);
});

test("flags deck pages without captured styled-components CSS", () => {
  const dir = makeDist({
    "deck/x/index.html": '<div id="root"><main>Deck list</main></div>',
    "deck/y/index.html": '<style data-styled="active"></style><div id="root"><main>Deck</main></div>',
    "deck/z/index.html": '<style data-styled="active">.a{color:red}</style><div id="root"><main>Deck</main></div>',
  });
  assert.deepStrictEqual(findUncapturedDeckStyles(dir), [
    path.join("deck", "x", "index.html"),
    path.join("deck", "y", "index.html"),
  ]);
});

test("passes a deck page with exactly one canonical of its own", () => {
  const dir = makeDist({
    "deck/x/index.html": '<link rel="canonical" href="https://pocketdecks.top/deck/x/">',
    "deck/a&b/index.html": '<link rel="canonical" href="https://pocketdecks.top/deck/a&amp;b/">',
    "deck/team-rocket's/index.html": '<link rel="canonical" href="https://pocketdecks.top/deck/team-rocket&apos;s/">',
  });
  assert.deepStrictEqual(findCanonicalIssues(dir), []);
});

test("flags a deck page with no canonical or a second one", () => {
  const dir = makeDist({
    "deck/x/index.html": "<head></head>",
    "deck/y/index.html":
      '<link rel="canonical" href="https://pocketdecks.top/deck/y/">' +
      '<link rel="canonical" href="https://pocketdecks.top/">',
  });
  assert.deepStrictEqual(findCanonicalIssues(dir), [
    `${path.join("deck", "x", "index.html")}: expected 1 canonical, found 0`,
    `${path.join("deck", "y", "index.html")}: expected 1 canonical, found 2`,
  ]);
});

test("flags a deck page whose canonical is not its own", () => {
  const dir = makeDist({
    "deck/x/index.html": '<link rel="canonical" href="https://pocketdecks.top/">',
  });
  assert.deepStrictEqual(findCanonicalIssues(dir), [
    `${path.join("deck", "x", "index.html")}: canonical https://pocketdecks.top/ is not https://pocketdecks.top/deck/x/`,
  ]);
});

test("passes HTML with non-empty styled-components CSS", () => {
  const dir = makeDist({
    "index.html": '<style data-styled="active">.title{color:red}</style>',
  });
  assert.deepStrictEqual(findEmptyStyledTags(dir), []);
});

test("flags empty styled-components CSS in nested pages", () => {
  const dir = makeDist({
    "index.html": '<style data-styled="active"></style>',
    "deck/x/index.html": '<style data-styled="active">\n  </style>',
  });
  const offenders = findEmptyStyledTags(dir);
  assert.strictEqual(offenders.length, 2);
  assert.ok(offenders.includes("index.html"));
  assert.ok(offenders.includes(`deck${path.sep}x${path.sep}index.html`));
});

test("passes routes whose modulepreload set matches the template", () => {
  const dir = makeDist({
    "index.html": `<head>${PRELOAD}</head>`,
    "deck/x/index.html": `<head>${PRELOAD}</head>`,
    "tier-list/index.html": `<head>${PRELOAD}</head>`,
  });
  assert.deepStrictEqual(findModulepreloadDrift(dir), []);
});

test("flags a route carrying a modulepreload the template never shipped", () => {
  const dir = makeDist({
    "index.html": `<head>${PRELOAD}</head>`,
    "deck/x/index.html": `<head>${PRELOAD}</head>`,
    "tier-list/index.html":
      `<head>${PRELOAD}<link rel="modulepreload" href="/assets/lazy.js" /></head>`,
  });
  assert.deepStrictEqual(findModulepreloadDrift(dir), [
    path.join("tier-list", "index.html") + ": /assets/entry.js, /assets/lazy.js",
  ]);
});

test("flags a route missing a template modulepreload", () => {
  const dir = makeDist({
    "deck/x/index.html": `<head>${PRELOAD}</head>`,
    "about/index.html": "<head></head>",
  });
  assert.deepStrictEqual(findModulepreloadDrift(dir), [
    path.join("about", "index.html") + ": ",
  ]);
});

test("passes relative and site-host scripts", () => {
  const dir = makeDist({
    "index.html":
      '<script type="module" src="/assets/app.js"></script>' +
      '<script src="https://pocketdecks.top/analytics.js"></script>',
  });
  assert.deepStrictEqual(findExternalScripts(dir), []);
});

test("flags a script pointing at another host", () => {
  const dir = makeDist({
    "index.html":
      '<script src="https://cdn.example.com/a.js"></script>' +
      '<script src="//tracker.example.net/b.js"></script>' +
      '<script type="module" src="/assets/app.js"></script>',
    "deck/x/index.html": '<script src="https://pocketdecks.top/ok.js"></script>',
  });
  assert.deepStrictEqual(findExternalScripts(dir), [
    "index.html: https://cdn.example.com/a.js",
    "index.html: //tracker.example.net/b.js",
  ]);
});

const THUMB_DECKS = [
  { name: "mega-lucario-ex-b3-081" },
  { name: "mega-altaria-ex-b1-102&espeon-b3a-020" },
];

test("passes when every deck icon id has a thumbnail", () => {
  const dir = makeDist({
    "thumbs/v3/b3-081-96.webp": "x",
    "thumbs/v3/b3-081-183.webp": "x",
    "thumbs/v3/b1-102-96.webp": "x",
    "thumbs/v3/b1-102-183.webp": "x",
    "thumbs/v3/b3a-020-96.webp": "x",
    "thumbs/v3/b3a-020-183.webp": "x",
  });
  assert.deepStrictEqual(findMissingDeckThumbs(dir, THUMB_DECKS), []);
});

test("flags a deck icon id with no thumbnail", () => {
  const dir = makeDist({
    "thumbs/v3/b3-081-96.webp": "x",
    "thumbs/v3/b3-081-183.webp": "x",
    "thumbs/v3/b1-102-96.webp": "x",
    "thumbs/v3/b1-102-183.webp": "x",
  });
  assert.deepStrictEqual(findMissingDeckThumbs(dir, THUMB_DECKS), ["b3a-020-96", "b3a-020-183"]);
});

test("flags a deck name without a card id without inventing a missing thumbnail", () => {
  const dir = makeDist({ "thumbs/v3/b3-081-96.webp": "x" });
  assert.deepStrictEqual(findMissingDeckThumbs(dir, [{ name: "Malformed" }]), []);
});

test("reports missing deck data clearly", () => {
  assert.throws(
    () => loadDecks(path.join(os.tmpdir(), "missing-deck-data")),
    /Unable to load deck data from .*best-decks\.json/
  );
});

test("flags live app state baked into the html tag", () => {
  const dir = makeDist({
    "index.html": '<html lang="en" data-consent-pending="" data-app-visible="true"><body></body></html>',
    "about/index.html": '<html lang="en" data-consent-pending><body></body></html>',
    "privacy/index.html": '<html lang="en"><body></body></html>',
  });
  assert.deepStrictEqual(findBakedAppState(dir).sort(), [
    `about${path.sep}index.html: data-consent-pending`,
    "index.html: data-app-visible",
    "index.html: data-consent-pending",
  ]);
});

test("ignores the consent attribute outside the html tag", () => {
  const dir = makeDist({
    "index.html": '<html lang="en"><head><script>root.setAttribute("data-consent-pending","")</script></head></html>',
  });
  assert.deepStrictEqual(findBakedAppState(dir), []);
});

const IMAGE_PRELOAD =
  '<link rel="preload" as="image" imagesrcset="/thumbs/v3/cards/b1-184-120.webp?v=3 120w, /thumbs/v3/cards/b1-184-240.webp?v=3 240w" imagesizes="240px" fetchpriority="high" />';
const CARD_THUMBS = {
  "thumbs/v3/cards/b1-184-120.webp": "x",
  "thumbs/v3/cards/b1-184-240.webp": "x",
};

test("passes a deck page with one image preload built into dist/thumbs", () => {
  const dir = makeDist({
    "deck/x/index.html": `<head>${IMAGE_PRELOAD}</head>`,
    ...CARD_THUMBS,
  });
  assert.deepStrictEqual(findDeckImagePreloadIssues(dir), []);
});

test("flags a deck page without exactly one image preload", () => {
  const dir = makeDist({
    "deck/x/index.html": "<head></head>",
    "deck/y/index.html": `<head>${IMAGE_PRELOAD}${IMAGE_PRELOAD}</head>`,
    ...CARD_THUMBS,
  });
  assert.deepStrictEqual(findDeckImagePreloadIssues(dir), [
    `deck${path.sep}x${path.sep}index.html: expected 1 image preload, found 0`,
    `deck${path.sep}y${path.sep}index.html: expected 1 image preload, found 2`,
  ]);
});

test("skips archetype hub pages, which carry no lead-card image preload", () => {
  const dir = makeDist({
    "deck/x/index.html": `<head>${IMAGE_PRELOAD}</head>`,
    "deck/umbreon/index.html": "<head></head>",
    "ja/deck/umbreon/index.html": "<head></head>",
    ...CARD_THUMBS,
  });
  assert.deepStrictEqual(findDeckImagePreloadIssues(dir, new Set(["umbreon"])), []);
});

test("flags an image preload that points at a file missing from dist/thumbs", () => {
  const dir = makeDist({
    "deck/x/index.html": `<head>${IMAGE_PRELOAD}</head>`,
    "thumbs/v3/cards/b1-184-240.webp": "x",
  });
  assert.deepStrictEqual(findDeckImagePreloadIssues(dir), [
    `deck${path.sep}x${path.sep}index.html: /thumbs/v3/cards/b1-184-120.webp is not built`,
  ]);
});

test("flags an image preload outside /thumbs/", () => {
  const dir = makeDist({
    "deck/x/index.html": '<head><link rel="preload" as="image" imagesrcset="https://raw.githubusercontent.com/a/b1/184.webp 240w" /></head>',
  });
  assert.deepStrictEqual(findDeckImagePreloadIssues(dir), [
    `deck${path.sep}x${path.sep}index.html: https://raw.githubusercontent.com/a/b1/184.webp is outside /thumbs/`,
  ]);
});

test("flags a deck card without a built card thumbnail", () => {
  const decks = [{ name: "mega-lucario-ex-b3-081", lists: [{ cards: ["2:b1-184", "1:pa-007"] }] }];
  const dir = makeDist({
    ...CARD_THUMBS,
    "thumbs/v3/cards/pa-007-120.webp": "x",
  });
  assert.deepStrictEqual(findMissingCardThumbs(dir, decks), ["pa-007-240"]);
});

test("passes every prerendered page with a canonical equal to its own URL", () => {
  const dir = makeDist({
    "index.html": '<link rel="canonical" href="https://pocketdecks.top/">',
    "tier-list/index.html": '<link rel="canonical" href="https://pocketdecks.top/tier-list/">',
    "deck/index.html": '<link rel="canonical" href="https://pocketdecks.top/deck/">',
  });
  assert.deepStrictEqual(findCanonicalIssues(dir), []);
});

test("flags a prerendered route whose canonical points at the home page", () => {
  const dir = makeDist({
    "statistics/index.html": '<link rel="canonical" href="https://pocketdecks.top/">',
  });
  assert.deepStrictEqual(findCanonicalIssues(dir), [
    `${path.join("statistics", "index.html")}: canonical https://pocketdecks.top/ is not https://pocketdecks.top/statistics/`,
  ]);
});

test("passes a noindex 404 page and app shell without a canonical", () => {
  const dir = makeDist({
    "404.html": '<meta name="robots" content="noindex">',
    "app-shell.html": '<meta name="robots" content="noindex">',
  });
  assert.deepStrictEqual(findShellPageIssues(dir), []);
});

test("flags a 404 page that is indexable or declares a canonical, and a missing app shell", () => {
  const dir = makeDist({
    "404.html":
      '<meta name="robots" content="index, follow"><link rel="canonical" href="https://pocketdecks.top/">',
  });
  assert.deepStrictEqual(findShellPageIssues(dir), [
    "404.html: no noindex robots meta",
    "404.html: has a canonical",
    "app-shell.html: missing",
  ]);
});

const APP_ROUTES = `
<Routes>
  <Route path="/" element={<Layout />}>
    <Route index element={<LandingPage />} />
    <Route path="tier-list" element={<TierListPage />} />
    <Route path="stats" element={<StatisticsPage />} />
    <Route path="feedback" element={<FeedbackPage />} />
    <Route path="about" element={<AboutPage />} />
    <Route path="deck">
      <Route index element={<DeckFinderPage />} />
      <Route path=":deckId" element={<DeckDetailPage />} />
    </Route>
    <Route path="*" element={<NotFoundPage />} />
  </Route>
</Routes>`;

const HOSTING = {
  hosting: {
    redirects: [{ source: "/stats", destination: "/statistics/", type: 301 }],
    rewrites: [{ source: "/feedback/**", destination: "/app-shell.html" }],
  },
};

test("flags app routes with no file, redirect, rewrite or deck page", () => {
  const dir = makeDist({
    "index.html": "",
    "tier-list/index.html": "",
    "app-shell.html": "",
  });
  assert.deepStrictEqual(
    findUnresolvedAppRoutes(dir, { source: APP_ROUTES, firebase: HOSTING }),
    [
      "/about: no file, redirect or rewrite",
      "/deck: no file, redirect or rewrite",
      "/deck/:deckId: no prerendered page under /deck/",
    ]
  );
});

test("passes app routes served by a file, a redirect or a built rewrite", () => {
  const dir = makeDist({
    "index.html": "",
    "tier-list/index.html": "",
    "about/index.html": "",
    "deck/index.html": "",
    "deck/x/index.html": "",
    "app-shell.html": "",
  });
  assert.deepStrictEqual(
    findUnresolvedAppRoutes(dir, { source: APP_ROUTES, firebase: HOSTING }),
    []
  );
});

test("flags a rewrite whose target is not built", () => {
  const dir = makeDist({
    "index.html": "",
    "tier-list/index.html": "",
    "about/index.html": "",
    "deck/index.html": "",
    "deck/x/index.html": "",
  });
  assert.deepStrictEqual(
    findUnresolvedAppRoutes(dir, { source: APP_ROUTES, firebase: HOSTING }),
    ["/feedback: rewrite target app-shell.html is not built"]
  );
});

const LOCALE_APP_ROUTES = `
<Routes>
  <Route path="/" element={<Layout />}>
    <Route index element={<LandingPage />} />
    <Route path="deck">
      <Route index element={<DeckFinderPage />} />
      <Route path=":deckId" element={<DeckDetailPage />} />
    </Route>
  </Route>
  <Route path="/ja" element={<Layout />}>
    <Route index element={<LandingPage />} />
    <Route path="deck">
      <Route index element={<DeckFinderPage />} />
      <Route path=":deckId" element={<DeckDetailPage />} />
    </Route>
  </Route>
</Routes>`;

test("flags a locale dynamic route with no prerendered page under it", () => {
  const dir = makeDist({
    "index.html": "",
    "deck/index.html": "",
    "deck/x/index.html": "",
    "ja/index.html": "",
    "ja/deck/index.html": "",
  });
  assert.deepStrictEqual(
    findUnresolvedAppRoutes(dir, { source: LOCALE_APP_ROUTES, firebase: HOSTING }),
    ["/ja/deck/:deckId: no prerendered page under /ja/deck/"]
  );
});

test("passes a locale dynamic route once its pages are built", () => {
  const dir = makeDist({
    "index.html": "",
    "deck/index.html": "",
    "deck/x/index.html": "",
    "ja/index.html": "",
    "ja/deck/index.html": "",
    "ja/deck/x/index.html": "",
  });
  assert.deepStrictEqual(
    findUnresolvedAppRoutes(dir, { source: LOCALE_APP_ROUTES, firebase: HOSTING }),
    []
  );
});

test("flags a locale deck page with an empty root", () => {
  const dir = makeDist({
    "deck/x/index.html": '<div id="root"><main>Deck list</main></div>',
    "ja/deck/x/index.html": '<div id="root"></div>',
  });
  assert.deepStrictEqual(findEmptyDeckRoots(dir), [
    path.join("ja", "deck", "x", "index.html"),
  ]);
});

test("flags a locale deck page without captured styled-components CSS", () => {
  const dir = makeDist({
    "deck/x/index.html": '<style data-styled="active">.a{color:red}</style><div id="root"><main>Deck</main></div>',
    "ja/deck/x/index.html": '<div id="root"><main>Deck</main></div>',
  });
  assert.deepStrictEqual(findUncapturedDeckStyles(dir), [
    path.join("ja", "deck", "x", "index.html"),
  ]);
});

test("flags a locale deck page without exactly one image preload", () => {
  const dir = makeDist({
    "deck/x/index.html": `<head>${IMAGE_PRELOAD}</head>`,
    "ja/deck/x/index.html": "<head></head>",
    ...CARD_THUMBS,
  });
  assert.deepStrictEqual(findDeckImagePreloadIssues(dir), [
    `ja${path.sep}deck${path.sep}x${path.sep}index.html: expected 1 image preload, found 0`,
  ]);
});

test("findExpansionListIssues needs the newest set and rejects deluxe packs", () => {
  const list = [
    { id: "b4a", name: "Team Rocket's Ambition", release_date: "2026-08-27", packs: [{ id: "b4a-booster", image: "https://example.test/packs/b4a-booster.webp" }] },
    { id: "b4b", name: "Deluxe Pack: Mega", release_date: "2026-09-30", packs: [{ id: "b4b-booster", image: "https://example.test/packs/b4b-booster.webp" }] },
  ];
  const enToggle = '<button type="button" aria-pressed="true">Expansions</button><button type="button" aria-pressed="false">Packs</button>';
  const jaToggle = '<button type="button" aria-pressed="true">拡張パック</button><button type="button" aria-pressed="false">ブースターパック</button>';
  const jaPage = `${jaToggle}<img src="https://example.test/packs/b4a-booster.webp">`;
  const good = makeDist({
    "expansion-list/index.html": `${enToggle}<img src="https://example.test/packs/b4a-booster.webp">`,
    "ja/expansion-list/index.html": jaPage,
  });
  const missing = makeDist({
    "expansion-list/index.html": `${enToggle}<div></div>`,
    "ja/expansion-list/index.html": jaPage,
  });
  const dataSrc = makeDist({
    "expansion-list/index.html": `${enToggle}<img data-src="https://example.test/packs/b4a-booster.webp">`,
    "ja/expansion-list/index.html": jaPage,
  });
  const deluxe = makeDist({
    "expansion-list/index.html": `${enToggle}<img src="https://example.test/packs/b4a-booster.webp"><img src="https://example.test/packs/b4b-booster.webp">`,
    "ja/expansion-list/index.html": jaPage,
  });
  assert.deepEqual(findExpansionListIssues(good, list), []);
  assert.deepEqual(findExpansionListIssues(missing, list), [
    "expansion-list/index.html: missing the newest set /packs/b4a-",
  ]);
  assert.deepEqual(findExpansionListIssues(dataSrc, list), [
    "expansion-list/index.html: missing the newest set /packs/b4a-",
  ]);
  assert.deepEqual(findExpansionListIssues(deluxe, list), [
    "expansion-list/index.html: deluxe pack /packs/b4b- is listed",
  ]);
});

test("findExpansionListIssues requires the Expansions option pressed on both list pages", () => {
  const list = [
    { id: "b4a", name: "Team Rocket's Ambition", release_date: "2026-08-27", packs: [{ id: "b4a-booster", image: "https://example.test/packs/b4a-booster.webp" }] },
  ];
  const img = '<img src="https://example.test/packs/b4a-booster.webp">';
  const packsDefault = '<button type="button" aria-pressed="false">Expansions</button><button type="button" aria-pressed="true">Packs</button>';
  const jaPacksDefault = '<button type="button" aria-pressed="false">拡張パック</button><button type="button" aria-pressed="true">ブースターパック</button>';
  const enToggle = '<button type="button" aria-pressed="true">Expansions</button><button type="button" aria-pressed="false">Packs</button>';
  const jaToggle = '<button type="button" aria-pressed="true">拡張パック</button><button type="button" aria-pressed="false">ブースターパック</button>';
  const enPackDefault = makeDist({
    "expansion-list/index.html": `${packsDefault}${img}`,
    "ja/expansion-list/index.html": `${jaToggle}${img}`,
  });
  const jaPackDefault = makeDist({
    "expansion-list/index.html": `${enToggle}${img}`,
    "ja/expansion-list/index.html": `${jaPacksDefault}${img}`,
  });
  assert.deepEqual(findExpansionListIssues(enPackDefault, list), [
    "expansion-list/index.html: the Expansions option is not pressed by default",
  ]);
  assert.deepEqual(findExpansionListIssues(jaPackDefault, list), [
    "ja/expansion-list/index.html: the Expansions option is not pressed by default",
  ]);
});

test("findExpansionListIssues rejects a tile that links to a pack filter on either list page", () => {
  const list = [
    { id: "b4a", name: "Team Rocket's Ambition", release_date: "2026-08-27", packs: [{ id: "b4a-booster", image: "https://example.test/packs/b4a-booster.webp" }] },
  ];
  const img = '<img src="https://example.test/packs/b4a-booster.webp">';
  const enToggle = '<button type="button" aria-pressed="true">Expansions</button><button type="button" aria-pressed="false">Packs</button>';
  const jaToggle = '<button type="button" aria-pressed="true">拡張パック</button><button type="button" aria-pressed="false">ブースターパック</button>';
  const enLinked = makeDist({
    "expansion-list/index.html": `${enToggle}<a href="/expansion-list/b4a?pack=booster">x</a>${img}`,
    "ja/expansion-list/index.html": `${jaToggle}${img}`,
  });
  const jaLinked = makeDist({
    "expansion-list/index.html": `${enToggle}${img}`,
    "ja/expansion-list/index.html": `${jaToggle}<a href="/ja/expansion-list/b4a?pack=booster">x</a>${img}`,
  });
  assert.deepEqual(findExpansionListIssues(enLinked, list), [
    "expansion-list/index.html: a tile links to a pack filter",
  ]);
  assert.deepEqual(findExpansionListIssues(jaLinked, list), [
    "ja/expansion-list/index.html: a tile links to a pack filter",
  ]);
});

test("expansion page verification requires every listed page and its robots policy", () => {
  const page = (title, robots, h1, canonical) => `<title>${title}</title><meta name="description" content="${title} cards"><meta name="robots" content="${robots}"><h1>${h1}</h1><link rel="canonical" href="${canonical}"><script type="application/ld+json">{"@type":"BreadcrumbList"}</script>`;
  const pages = {
    "expansion-list/c1/index.html": page("Dual Fusion", "index, follow", "Dual Fusion (C1)", "https://pocketdecks.top/expansion-list/c1/"),
    "ja/expansion-list/c1/index.html": page("デュアルフュージョン", "index, follow", "デュアルフュージョン (C1)", "https://pocketdecks.top/ja/expansion-list/c1/"),
    "expansion-list/b4a/index.html": page("Team Rocket's Ambition", "noindex, follow", "Team Rocket's Ambition (B4a)", "https://pocketdecks.top/expansion-list/b4a/"),
    "ja/expansion-list/b4a/index.html": page("ロケット団の栄光", "noindex, follow", "ロケット団の栄光 (B4a)", "https://pocketdecks.top/ja/expansion-list/b4a/"),
    "expansion-list/a1/index.html": page("Genetic Apex", "noindex, follow", "Genetic Apex (A1)", "https://pocketdecks.top/expansion-list/a1/"),
    "ja/expansion-list/a1/index.html": page("最強の遺伝子", "noindex, follow", "最強の遺伝子 (A1)", "https://pocketdecks.top/ja/expansion-list/a1/"),
  };
  const dir = makeDist(pages);
  const expansions = [
    { id: "a1", release_date: "2024-01-01" },
    { id: "b4a", release_date: "2026-08-27" },
    { id: "c1", release_date: "2026-10-29" },
  ];
  const decks = [{ lists: [{ cards: ["1:a1-001", "1:b4a-001", "1:c1-001", "1:c1-002", "1:c1-003", "1:c1-004", "1:c1-005"] }] }];
  assert.deepStrictEqual(findExpansionPageIssues(dir, expansions, decks), []);
  const withoutJaC1 = { ...pages };
  delete withoutJaC1["ja/expansion-list/c1/index.html"];
  assert.ok(
    findExpansionPageIssues(makeDist(withoutJaC1), expansions, decks).includes("ja/expansion-list/c1/index.html: missing")
  );
  const b4aIndexed = {
    ...pages,
    "expansion-list/b4a/index.html": page("Team Rocket's Ambition", "index, follow", "Team Rocket's Ambition (B4a)", "https://pocketdecks.top/expansion-list/b4a/"),
  };
  assert.ok(
    findExpansionPageIssues(makeDist(b4aIndexed), expansions, decks).includes(
      "expansion-list/b4a/index.html: robots index, follow is not noindex, follow"
    )
  );
});

test("expansion page verification flags a page without BreadcrumbList structured data", () => {
  const page = (title, robots, h1, canonical) => `<title>${title}</title><meta name="description" content="${title} cards"><meta name="robots" content="${robots}"><h1>${h1}</h1><link rel="canonical" href="${canonical}">`;
  const dir = makeDist({
    "expansion-list/c1/index.html": page("Dual Fusion", "index, follow", "Dual Fusion (C1)", "https://pocketdecks.top/expansion-list/c1/"),
  });
  const expansions = [{ id: "c1", release_date: "2026-10-29" }];
  const decks = [{ lists: [{ cards: ["1:c1-001"] }] }];
  assert.ok(findExpansionPageIssues(dir, expansions, decks).some((issue) => issue.includes("expansion-list/c1/index.html") && issue.includes("BreadcrumbList")));
});

const cspFirebase = (scriptSrc, extra = []) => ({
  hosting: {
    headers: [
      {
        source: "**",
        headers: [
          ...(scriptSrc === null
            ? []
            : [{ key: "Content-Security-Policy", value: `default-src 'self'; script-src 'self' ${scriptSrc}; frame-ancestors 'none'` }]),
          ...extra,
        ],
      },
    ],
  },
});
const sha = (body) => `'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`;
const inlineHtml = (body) => `<html><head><script>${body}</script></head></html>`;

test("passes built HTML whose inline scripts are all hashed in script-src", () => {
  const body = "window.theme='dark';";
  const dir = makeDist({ "index.html": inlineHtml(body), "tier-list/index.html": inlineHtml(body) });
  assert.deepStrictEqual(findCspHashIssues(dir, cspFirebase(sha(body))), []);
});

test("flags an inline script whose hash is not in script-src, naming the page and hash", () => {
  const dir = makeDist({ "index.html": inlineHtml("window.drift=1;") });
  const expected = `index.html: ${sha("window.drift=1;")} is not in script-src`;
  assert.deepStrictEqual(findCspHashIssues(dir, cspFirebase(sha("window.theme='dark';"))), [expected]);
});

test("flags a hash placed in another directive instead of script-src", () => {
  const body = "window.x=1;";
  const dir = makeDist({ "index.html": inlineHtml(body) });
  const firebase = cspFirebase("");
  firebase.hosting.headers[0].headers[0].value += `; style-src ${sha(body)}`;
  assert.deepStrictEqual(findCspHashIssues(dir, firebase), [
    `index.html: ${sha(body)} is not in script-src`,
  ]);
});

test("flags a missing enforced header", () => {
  const dir = makeDist({ "index.html": inlineHtml("x") });
  assert.deepStrictEqual(findCspHashIssues(dir, cspFirebase(null)), [
    "firebase.json: no Content-Security-Policy header on **",
  ]);
});

test("the shipped firebase.json policy passes a page carrying the template theme script", () => {
  const body = fs.readFileSync(path.join(__dirname, "..", "..", "index.html"), "utf8")
    .match(/<script data-theme-init="true">([\s\S]*?)<\/script>/)[1];
  const dir = makeDist({ "index.html": `<script data-theme-init="true">${body}</script>` });
  const firebase = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "firebase.json"), "utf8"));
  assert.deepStrictEqual(findCspHashIssues(dir, firebase), []);
});

const cspWithPolicy = (value) => ({
  hosting: {
    headers: [{ source: "**", headers: [{ key: "Content-Security-Policy", value }] }],
  },
});

test("uses the first duplicate script-src directive", () => {
  const body = "window.duplicate=1;";
  const dir = makeDist({ "index.html": inlineHtml(body) });
  assert.deepStrictEqual(
    findCspHashIssues(dir, cspWithPolicy(`script-src 'none'; script-src ${sha(body)}`)),
    [`index.html: ${sha(body)} is not in script-src`]
  );
});

test("keeps the first allowed duplicate script-src directive", () => {
  const body = "window.duplicate=1;";
  const dir = makeDist({ "index.html": inlineHtml(body) });
  assert.deepStrictEqual(
    findCspHashIssues(dir, cspWithPolicy(`script-src ${sha(body)}; script-src 'none'`)),
    []
  );
});

test("applies first-wins to mixed-case duplicate script-src names", () => {
  const body = "window.duplicate=1;";
  const dir = makeDist({ "index.html": inlineHtml(body) });
  assert.deepStrictEqual(
    findCspHashIssues(dir, cspWithPolicy(`SCRIPT-SRC 'none'; script-src ${sha(body)}`)),
    [`index.html: ${sha(body)} is not in script-src`]
  );
});

test("keeps a first empty script-src restrictive over a duplicate", () => {
  const body = "window.duplicate=1;";
  const dir = makeDist({ "index.html": inlineHtml(body) });
  assert.deepStrictEqual(
    findCspHashIssues(dir, cspWithPolicy(`script-src; script-src ${sha(body)}`)),
    [`index.html: ${sha(body)} is not in script-src`]
  );
});

test("uses script-src-elem before script-src for inline scripts", () => {
  const body = "window.element=1;";
  const dir = makeDist({ "index.html": inlineHtml(body) });
  assert.deepStrictEqual(
    findCspHashIssues(dir, cspWithPolicy(`script-src ${sha(body)}; script-src-elem 'none'`)),
    [`index.html: ${sha(body)} is not in script-src-elem`]
  );
});

test("allows a hash in script-src-elem over a restrictive script-src", () => {
  const body = "window.element=1;";
  const dir = makeDist({ "index.html": inlineHtml(body) });
  assert.deepStrictEqual(
    findCspHashIssues(dir, cspWithPolicy(`script-src 'none'; script-src-elem ${sha(body)}`)),
    []
  );
});

test("keeps an empty script-src-elem restrictive", () => {
  const body = "window.element=1;";
  const dir = makeDist({ "index.html": inlineHtml(body) });
  assert.deepStrictEqual(
    findCspHashIssues(dir, cspWithPolicy(`script-src ${sha(body)}; script-src-elem`)),
    [`index.html: ${sha(body)} is not in script-src-elem`]
  );
});

test("falls back to default-src when no script directive is present", () => {
  const body = "window.defaulted=1;";
  const dir = makeDist({ "index.html": inlineHtml(body) });
  assert.deepStrictEqual(
    findCspHashIssues(dir, cspWithPolicy(`default-src ${sha(body)}`)),
    []
  );
});

test("names default-src when it does not allow the inline script", () => {
  const body = "window.defaulted=1;";
  const dir = makeDist({ "index.html": inlineHtml(body) });
  assert.deepStrictEqual(
    findCspHashIssues(dir, cspWithPolicy("default-src 'self'")),
    [`index.html: ${sha(body)} is not in default-src`]
  );
});

test("keeps an empty script-src restrictive over default-src", () => {
  const body = "window.defaulted=1;";
  const dir = makeDist({ "index.html": inlineHtml(body) });
  assert.deepStrictEqual(
    findCspHashIssues(dir, cspWithPolicy(`default-src ${sha(body)}; script-src`)),
    [`index.html: ${sha(body)} is not in script-src`]
  );
});
test("flags a built page with two titles and passes a page with one", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "title-count-"));
  fs.mkdirSync(path.join(dir, "deck", "a"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "deck", "a", "index.html"),
    "<!doctype html><html><head><title>A</title><title>B</title></head><body></body></html>"
  );
  fs.writeFileSync(path.join(dir, "index.html"), "<!doctype html><html><head><title>Home</title></head><body></body></html>");
  const issues = findTitleCountIssues(dir);
  assert.equal(issues.length, 1);
  assert.match(issues[0], /deck.a.index\.html: expected 1 title, found 2/);
});

test(
  "every built page has exactly one title",
  { skip: !fs.existsSync(path.join(__dirname, "..", "..", "dist", "index.html")) && "dist/ is not built" },
  () => {
    assert.deepEqual(findTitleCountIssues(), []);
  }
);

test("passes when every live deck has a page in both locales", () => {
  const dir = makeDist({
    "deck/garchomp-zz-999/index.html": "<head></head>",
    "ja/deck/garchomp-zz-999/index.html": "<head></head>",
  });
  assert.deepStrictEqual(findMissingLiveDeckPages(dir, [{ name: "garchomp-zz-999", lists: [] }]), []);
});

test("flags live decks whose pages are missing in either locale", () => {
  const dir = makeDist({
    "deck/garchomp-zz-999/index.html": "<head></head>",
  });
  const decks = [{ name: "garchomp-zz-999", lists: [] }, { name: "mega-altaria-ex-b1-102", lists: [] }];
  assert.deepStrictEqual(findMissingLiveDeckPages(dir, decks), [
    "ja/deck/garchomp-zz-999/index.html: missing",
    "deck/mega-altaria-ex-b1-102/index.html: missing",
    "ja/deck/mega-altaria-ex-b1-102/index.html: missing",
  ]);
});

test("a deck page without a card id must carry no image preload", () => {
  const dir = makeDist({
    "deck/x/index.html": "<head></head>",
    "deck/y/index.html": `<head>${IMAGE_PRELOAD}</head>`,
    ...CARD_THUMBS,
  });
  assert.deepStrictEqual(findDeckImagePreloadIssues(dir, new Set(), new Set(["x", "y"])), [
    `deck${path.sep}y${path.sep}index.html: expected 0 image preloads, found 1`,
  ]);
});

test("a deck page without a card id passes with no image preload", () => {
  const dir = makeDist({
    "deck/x/index.html": "<head></head>",
    "ja/deck/x/index.html": "<head></head>",
  });
  assert.deepStrictEqual(findDeckImagePreloadIssues(dir, new Set(), new Set(["x"])), []);
});
