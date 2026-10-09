const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  findBakedAppState,
  findCanonicalIssues,
  findShellPageIssues,
  findUnresolvedAppRoutes,
  findDeckImagePreloadIssues,
  findEmptyDeckRoots,
  findEmptyStyledTags,
  findExpansionListIssues,
  findExternalScripts,
  findLoopbackRefs,
  findMissingCardThumbs,
  findMissingDeckThumbs,
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

test("findExpansionListIssues needs the newest set and rejects deluxe packs", () => {
  const list = [
    { id: "b4a", name: "Team Rocket's Ambition", release_date: "2026-08-27", packs: [{ id: "b4a-booster", image: "https://example.test/packs/b4a-booster.webp" }] },
    { id: "b4b", name: "Deluxe Pack: Mega", release_date: "2026-09-30", packs: [{ id: "b4b-booster", image: "https://example.test/packs/b4b-booster.webp" }] },
  ];
  const good = makeDist({ "expansion-list/index.html": '<img src="https://example.test/packs/b4a-booster.webp">' });
  const missing = makeDist({ "expansion-list/index.html": "<div></div>" });
  const dataSrc = makeDist({ "expansion-list/index.html": '<img data-src="https://example.test/packs/b4a-booster.webp">' });
  const deluxe = makeDist({ "expansion-list/index.html": '<img src="https://example.test/packs/b4a-booster.webp"><img src="https://example.test/packs/b4b-booster.webp">' });
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
