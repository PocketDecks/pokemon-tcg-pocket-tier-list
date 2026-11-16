const test = require("node:test");
const assert = require("node:assert");
const { findUnresolvedAppRoutes, appRoutePaths } = require("../verify-dist-html");
const { PAGE_ROUTES } = require("../routes.mjs");
const { resolveHosting } = require("../firebase-hosting");
const { makeDist } = require("./verify-dist-html-fixtures");

// The route table expands under every locale prefix; these tests exercise the
// un-prefixed routes, and the locale tests further down cover the prefixed ones.
const findEnglishRoutes = (dir, options) =>
  findUnresolvedAppRoutes(dir, options).filter((issue) => !issue.startsWith("/ja/") && !issue.startsWith("/ja:"));

const SINGLE_FEEDBACK_ROUTE = ["/feedback"];

const APP_ROUTES = ["/", "/tier-list", "/stats", "/feedback", "/about", "/deck", "/deck/:deckId"];

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
    findEnglishRoutes(dir, { routes: APP_ROUTES, firebase: HOSTING }),
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
    findEnglishRoutes(dir, { routes: APP_ROUTES, firebase: HOSTING_WITH_FEEDBACK_REDIRECT }),
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
    findEnglishRoutes(dir, { routes: APP_ROUTES, firebase: HOSTING }),
    ["/feedback: no file, redirect or rewrite"]
  );
});

test("flags a missing slashed route when its bare route resolves to a file", () => {
  const dir = makeDist({ "index.html": "", feedback: "" });
  const firebase = { hosting: { redirects: [], rewrites: [] } };
  assert.equal(resolveHosting(firebase, new Set(["feedback"]), "/feedback").kind, "file");
  assert.deepStrictEqual(
    findEnglishRoutes(dir, {
      routes: SINGLE_FEEDBACK_ROUTE,
      firebase,
    }),
    ["/feedback/: no file, redirect or rewrite"]
  );
});

test("flags a missing slashed rewrite target when its bare route resolves to a file", () => {
  const dir = makeDist({ "index.html": "", feedback: "" });
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
    findEnglishRoutes(dir, {
      routes: SINGLE_FEEDBACK_ROUTE,
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
    findEnglishRoutes(dir, { routes: APP_ROUTES, firebase }),
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
    findEnglishRoutes(dir, { routes: APP_ROUTES, firebase: HOSTING_WITH_FEEDBACK_REDIRECT }),
    ["/feedback/: rewrite target app-shell.html is not built"]
  );
});

const LOCALE_APP_ROUTES = ["/", "/deck", "/deck/:deckId"];

const FEEDBACK_APP_ROUTES = ["/feedback"];

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
  const dir = makeDist({ "index.html": "", "ja/index.html": "", "app-shell.html": "" });
  assert.deepStrictEqual(findUnresolvedAppRoutes(dir, { routes: FEEDBACK_APP_ROUTES, firebase: FEEDBACK_HOSTING }), []);

  const badDestination = {
    hosting: {
      ...FEEDBACK_HOSTING.hosting,
      redirects: FEEDBACK_HOSTING.hosting.redirects.map((rule) =>
        rule.regex === "^/ja/feedback$" ? { ...rule, destination: "/ja/missing/" } : rule
      ),
    },
  };
  assert.deepStrictEqual(
    findUnresolvedAppRoutes(dir, { routes: FEEDBACK_APP_ROUTES, firebase: badDestination }),
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
    findUnresolvedAppRoutes(dir, { routes: LOCALE_APP_ROUTES, firebase: HOSTING }),
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
    findUnresolvedAppRoutes(dir, { routes: LOCALE_APP_ROUTES, firebase: HOSTING }),
    []
  );
});

test("flags a dynamic route whose built deck page hosting redirects to a missing destination", () => {
  const dir = makeDist({ "index.html": "", "deck/index.html": "", "deck/x/index.html": "" });
  const firebase = {
    hosting: { redirects: [{ source: "/deck/**", destination: "/missing/", type: 301 }], rewrites: [] },
  };
  assert.deepStrictEqual(findEnglishRoutes(dir, { routes: ["/deck/:deckId"], firebase }), [
    "/deck/x/: redirect to /missing/ does not resolve",
  ]);
});

test("passes a dynamic route whose built deck page hosting serves directly", () => {
  const dir = makeDist({ "index.html": "", "deck/index.html": "", "deck/x/index.html": "" });
  const firebase = { hosting: { redirects: [], rewrites: [] } };
  assert.deepStrictEqual(findEnglishRoutes(dir, { routes: ["/deck/:deckId"], firebase }), []);
});

test("lists the routes under every locale prefix", () => {
  assert.deepStrictEqual(appRoutePaths(LOCALE_APP_ROUTES), [
    "/",
    "/deck",
    "/deck/:deckId",
    "/ja",
    "/ja/deck",
    "/ja/deck/:deckId",
  ]);
});

test("lists every manifest route, in both locales", () => {
  const pages = PAGE_ROUTES.map(({ route }) => route).filter((route) => route !== "/");
  assert.deepStrictEqual(appRoutePaths(), ["/", ...pages, "/ja", ...pages.map((page) => `/ja${page}`)]);
});
