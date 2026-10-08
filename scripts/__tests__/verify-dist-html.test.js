const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  findEmptyStyledTags,
  findExternalScripts,
  findLoopbackRefs,
  findMissingDeckThumbs,
  loadDecks,
  findModulepreloadDrift,
  findNonEmptyDeckRoots,
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

test("passes deck pages with empty roots", () => {
  const dir = makeDist({
    "deck/index.html": '<div id="root"><main>Finder</main></div>',
    "deck/x/index.html": '<div id="root"></div>',
  });
  assert.deepStrictEqual(findNonEmptyDeckRoots(dir), []);
});

test("flags deck pages with non-empty roots", () => {
  const dir = makeDist({
    "deck/x/index.html": '<div id="root"><main>Home page</main></div>',
  });
  assert.deepStrictEqual(findNonEmptyDeckRoots(dir), [
    path.join("deck", "x", "index.html"),
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
