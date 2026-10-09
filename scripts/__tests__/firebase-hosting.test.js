const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { resolveHosting } = require("../firebase-hosting");

const config = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "..", "firebase.json"), "utf8")
);
const FILES = new Set([
  "index.html",
  "404.html",
  "app-shell.html",
  "tier-list/index.html",
  "statistics/index.html",
  "deck/index.html",
  "deck/hoopa-ex-b4-103/index.html",
  "assets/index-abc.js",
]);
const resolve = (requestPath) => resolveHosting(config, FILES, requestPath);
const NOT_FOUND = { kind: "not-found", status: 404, file: "404.html" };

test("retired deck URLs and stray CRA paths get a real 404", () => {
  assert.deepStrictEqual(resolve("/deck/hydreigon-b1-157/"), NOT_FOUND);
  assert.deepStrictEqual(resolve("/deck/mewtwo-ex"), NOT_FOUND);
  assert.deepStrictEqual(resolve("/deck/espeon-b3a-020&swablu-b1-196/"), NOT_FOUND);
  assert.deepStrictEqual(
    resolve("/static/media/tier-list.f2be021f77be320a4822.jpeg"),
    NOT_FOUND
  );
});

test("unknown paths and missing assets never fall back to the home page", () => {
  assert.deepStrictEqual(resolve("/does-not-exist"), NOT_FOUND);
  assert.deepStrictEqual(resolve("/assets/missing.js"), NOT_FOUND);
  assert.ok(
    !config.hosting.rewrites.some((rule) => rule.destination === "/index.html"),
    "no rewrite may serve the prerendered home page"
  );
});

test("stats permanently redirects to statistics", () => {
  const redirect = { kind: "redirect", status: 301, location: "/statistics/" };
  assert.deepStrictEqual(resolve("/stats"), redirect);
  assert.deepStrictEqual(resolve("/stats/"), redirect);
});

test("legacy card and expansion paths permanently redirect", () => {
  assert.deepStrictEqual(resolve("/cards"), {
    kind: "redirect",
    status: 301,
    location: "/cards-list/",
  });
  assert.deepStrictEqual(resolve("/cards/"), {
    kind: "redirect",
    status: 301,
    location: "/cards-list/",
  });
  assert.deepStrictEqual(resolve("/expansions"), {
    kind: "redirect",
    status: 301,
    location: "/expansion-list/",
  });
  assert.deepStrictEqual(resolve("/expansions/"), {
    kind: "redirect",
    status: 301,
    location: "/expansion-list/",
  });
});

test("feedback is served by the app shell with status 200", () => {
  const rewrite = { kind: "rewrite", status: 200, file: "app-shell.html" };
  assert.deepStrictEqual(resolve("/feedback"), rewrite);
  assert.deepStrictEqual(resolve("/feedback/"), rewrite);
});

test("prerendered routes resolve to their own files", () => {
  assert.deepStrictEqual(resolve("/"), { kind: "file", file: "index.html", status: 200 });
  assert.deepStrictEqual(resolve("/tier-list/"), {
    kind: "file",
    file: "tier-list/index.html",
    status: 200,
  });
  assert.deepStrictEqual(resolve("/tier-list"), {
    kind: "redirect",
    status: 301,
    location: "/tier-list/",
  });
  assert.deepStrictEqual(resolve("/deck/hoopa-ex-b4-103/"), {
    kind: "file",
    file: "deck/hoopa-ex-b4-103/index.html",
    status: 200,
  });
});
