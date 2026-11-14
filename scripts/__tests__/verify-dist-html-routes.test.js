const test = require("node:test");
const assert = require("node:assert");
const { findUnresolvedAppRoutes } = require("../verify-dist-html");
const { resolveHosting } = require("../firebase-hosting");
const { makeDist } = require("./verify-dist-html-fixtures");

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

const HOSTING_WITH_FEEDBACK_REDIRECT = {
  hosting: {
    redirects: [
      ...HOSTING.hosting.redirects,
      { regex: "^/feedback$", destination: "/feedback/", type: 301 },
    ],
    rewrites: HOSTING.hosting.rewrites,
  },
};

test("flags app routes with no file, redirect, rewrite or deck page", () => {
  const dir = makeDist({
    "index.html": "",
    "tier-list/index.html": "",
    "statistics/index.html": "",
    "app-shell.html": "",
  });
  assert.deepStrictEqual(
    findUnresolvedAppRoutes(dir, { source: APP_ROUTES, firebase: HOSTING }),
    [
      "/feedback: no file, redirect or rewrite",
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
    "statistics/index.html": "",
    "about/index.html": "",
    "deck/index.html": "",
    "deck/x/index.html": "",
    "app-shell.html": "",
  });
  assert.deepStrictEqual(
    findUnresolvedAppRoutes(dir, { source: APP_ROUTES, firebase: HOSTING_WITH_FEEDBACK_REDIRECT }),
    []
  );
});

test("flags a bare route that only a slashed rewrite serves", () => {
  const dir = makeDist({
    "index.html": "",
    "tier-list/index.html": "",
    "statistics/index.html": "",
    "about/index.html": "",
    "deck/index.html": "",
    "deck/x/index.html": "",
    "app-shell.html": "",
  });
  assert.deepStrictEqual(
    findUnresolvedAppRoutes(dir, { source: APP_ROUTES, firebase: HOSTING }),
    ["/feedback: no file, redirect or rewrite"]
  );
});

test("flags a missing slashed route when its bare route resolves to a file", () => {
  const dir = makeDist({ feedback: "" });
  const firebase = { hosting: { redirects: [], rewrites: [] } };
  assert.equal(resolveHosting(firebase, new Set(["feedback"]), "/feedback").kind, "file");
  assert.deepStrictEqual(
    findUnresolvedAppRoutes(dir, {
      source: '<Routes><Route path="/feedback" element={<FeedbackPage />} /></Routes>',
      firebase,
    }),
    ["/feedback/: no file, redirect or rewrite"]
  );
});

test("flags a missing slashed rewrite target when its bare route resolves to a file", () => {
  const dir = makeDist({ feedback: "" });
  const firebase = {
    hosting: { redirects: [], rewrites: [{ source: "/feedback/**", destination: "/app-shell.html" }] },
  };
  const files = new Set(["feedback"]);
  assert.equal(resolveHosting(firebase, files, "/feedback").kind, "file");
  assert.deepStrictEqual(resolveHosting(firebase, files, "/feedback/"), {
    kind: "rewrite",
    status: 200,
    file: "app-shell.html",
  });
  assert.deepStrictEqual(
    findUnresolvedAppRoutes(dir, {
      source: '<Routes><Route path="/feedback" element={<FeedbackPage />} /></Routes>',
      firebase,
    }),
    ["/feedback/: rewrite target app-shell.html is not built"]
  );
});

test("flags a redirect whose destination does not resolve", () => {
  const dir = makeDist({
    "index.html": "",
    "tier-list/index.html": "",
    "statistics/index.html": "",
    "about/index.html": "",
    "deck/index.html": "",
    "deck/x/index.html": "",
    "app-shell.html": "",
  });
  const firebase = {
    hosting: {
      ...HOSTING_WITH_FEEDBACK_REDIRECT.hosting,
      redirects: [
        { source: "/feedback", destination: "/nowhere/", type: 301 },
        ...HOSTING.hosting.redirects,
      ],
    },
  };
  assert.deepStrictEqual(
    findUnresolvedAppRoutes(dir, { source: APP_ROUTES, firebase }),
    ["/feedback: redirect to /nowhere/ does not resolve"]
  );
});

test("flags a rewrite whose target is not built", () => {
  const dir = makeDist({
    "index.html": "",
    "tier-list/index.html": "",
    "statistics/index.html": "",
    "about/index.html": "",
    "deck/index.html": "",
    "deck/x/index.html": "",
  });
  assert.deepStrictEqual(
    findUnresolvedAppRoutes(dir, { source: APP_ROUTES, firebase: HOSTING_WITH_FEEDBACK_REDIRECT }),
    ["/feedback/: rewrite target app-shell.html is not built"]
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

const FEEDBACK_APP_ROUTES =
  '<Routes><Route path="/ja/feedback" element={<FeedbackPage />} /></Routes>';

const FEEDBACK_HOSTING = {
  hosting: {
    redirects: [
      { regex: "^/feedback$", destination: "/feedback/", type: 301 },
      { regex: "^/ja/feedback$", destination: "/ja/feedback/", type: 301 },
    ],
    rewrites: [
      { source: "/feedback/**", destination: "/app-shell.html" },
      { source: "/ja/feedback/**", destination: "/app-shell.html" },
    ],
  },
};

test("checks the Japanese feedback redirect, rewrite and destination", () => {
  const dir = makeDist({ "app-shell.html": "" });
  assert.deepStrictEqual(findUnresolvedAppRoutes(dir, { source: FEEDBACK_APP_ROUTES, firebase: FEEDBACK_HOSTING }), []);

  const badDestination = {
    hosting: {
      ...FEEDBACK_HOSTING.hosting,
      redirects: FEEDBACK_HOSTING.hosting.redirects.map((rule) =>
        rule.regex === "^/ja/feedback$" ? { ...rule, destination: "/ja/missing/" } : rule
      ),
    },
  };
  assert.deepStrictEqual(
    findUnresolvedAppRoutes(dir, { source: FEEDBACK_APP_ROUTES, firebase: badDestination }),
    ["/ja/feedback: redirect to /ja/missing/ does not resolve"]
  );
});

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
