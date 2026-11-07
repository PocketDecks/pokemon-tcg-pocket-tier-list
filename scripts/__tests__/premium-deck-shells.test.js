const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  premiumShellHtml,
  premiumShellPages,
  writePremiumShells,
} = require("../prerender-decks");
const { findPremiumShellIssues, findCanonicalIssues, findEmptyDeckRoots } = require("../verify-dist-html");

const SLUG = "mega-altaria-ex-b1-102&bonsly-b3-078";
const OTHER = "old-a1-009";

const TEMPLATE =
  '<!doctype html><html lang="en"><head><meta charset="utf-8" />' +
  '<meta name="robots" content="index, follow, noimageai" />' +
  '<link rel="alternate" hreflang="en" href="https://pocketdecks.top/" />' +
  '<link rel="canonical" href="https://pocketdecks.top/" />' +
  '<meta property="og:title" content="Top Pocket Decks" />' +
  "<title>Top Pocket Decks</title></head><body><div id=\"root\"></div></body></html>";

const makeDist = (files) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dist-"));
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  }
  return dir;
};

const SHELL = premiumShellHtml(TEMPLATE, "en");
const JA_SHELL = premiumShellHtml(TEMPLATE, "ja");

const shellDist = (slugs, extra = {}) =>
  makeDist({
    ...Object.fromEntries(
      slugs.flatMap((slug) => [
        [`deck/${slug}/index.html`, SHELL],
        [`ja/deck/${slug}/index.html`, JA_SHELL],
      ])
    ),
    ...extra,
  });

const OPTIONS = (slugs) => ({ slugs, otherSlugs: new Set(["live-a1-001", "hub-slug"]) });

test("a premium shell is the app template marked noindex with no canonical or alternates", () => {
  assert.match(SHELL, /<meta name="robots" content="noindex">/);
  assert.doesNotMatch(SHELL, /index, follow/);
  assert.doesNotMatch(SHELL, /rel="canonical"/);
  assert.doesNotMatch(SHELL, /hreflang/);
  assert.match(SHELL, /<div id="root"><\/div>/);
});

test("a premium shell carries its locale and no deck statistics", () => {
  assert.match(JA_SHELL, /<html lang="ja">/);
  assert.match(SHELL, /<html lang="en">/);
  assert.doesNotMatch(SHELL, /powerScore|winRate|bestList/);
});

test("plans one shell per premium-only slug in every route locale", () => {
  const pages = premiumShellPages([SLUG, OTHER], new Set(["live-a1-001"]));

  assert.deepEqual(
    pages.map((page) => page.route).sort(),
    [`/deck/${SLUG}`, `/deck/${OTHER}`, `/ja/deck/${SLUG}`, `/ja/deck/${OTHER}`].sort()
  );
});

test("plans nothing for an empty list", () => {
  assert.deepEqual(premiumShellPages([], new Set(["live-a1-001"])), []);
});

test("refuses to plan a shell over a live deck page", () => {
  assert.throws(() => premiumShellPages([SLUG], new Set([SLUG])), (error) => error.message.includes(SLUG));
});

test("writes each shell to its own index file", () => {
  const dir = makeDist({});
  writePremiumShells(dir, TEMPLATE, premiumShellPages([SLUG], new Set()));

  assert.equal(fs.readFileSync(path.join(dir, "deck", SLUG, "index.html"), "utf8"), SHELL);
  assert.equal(fs.readFileSync(path.join(dir, "ja", "deck", SLUG, "index.html"), "utf8"), JA_SHELL);
});

test("passes a dist holding exactly the expected shells", () => {
  const dir = shellDist([SLUG, OTHER], { "deck/live-a1-001/index.html": "<html></html>" });

  assert.deepEqual(findPremiumShellIssues(dir, OPTIONS([SLUG, OTHER])), []);
});

test("passes a dist with no premium-only slugs and no shells", () => {
  const dir = makeDist({ "deck/live-a1-001/index.html": "<html></html>" });

  assert.deepEqual(findPremiumShellIssues(dir, OPTIONS([])), []);
});

test("flags a missing shell in either locale", () => {
  const dir = makeDist({ [`deck/${SLUG}/index.html`]: SHELL });

  assert.deepEqual(findPremiumShellIssues(dir, OPTIONS([SLUG])), [
    `${path.join("ja", "deck", SLUG, "index.html")}: missing`,
  ]);
});

test("flags an extra shell for a slug that is not on the list", () => {
  const dir = shellDist([SLUG, OTHER]);

  assert.deepEqual(findPremiumShellIssues(dir, OPTIONS([SLUG])), [
    `${path.join("deck", OTHER, "index.html")}: unexpected deck page`,
    `${path.join("ja", "deck", OTHER, "index.html")}: unexpected deck page`,
  ]);
});

test("flags a shell that is indexable, canonical, alternate-linked or carries a rendered page", () => {
  const dir = makeDist({
    [`deck/${SLUG}/index.html`]:
      '<meta name="robots" content="index, follow"><link rel="canonical" href="https://pocketdecks.top/deck/x/">' +
      '<link rel="alternate" hreflang="en" href="https://pocketdecks.top/deck/x/"><div id="root"><h1>Deck</h1></div>',
    [`ja/deck/${SLUG}/index.html`]: JA_SHELL,
  });
  const entry = path.join("deck", SLUG, "index.html");

  assert.deepEqual(findPremiumShellIssues(dir, OPTIONS([SLUG])), [
    `${entry}: no noindex robots meta`,
    `${entry}: has a canonical`,
    `${entry}: has alternates`,
    `${entry}: carries rendered content`,
  ]);
});

test("the canonical and empty-root checks leave premium shells alone", () => {
  const dir = shellDist([SLUG], { "deck/live-a1-001/index.html": TEMPLATE.replace("<div", "<div data-x") });

  assert.deepEqual(findCanonicalIssues(dir, [SLUG]).filter((issue) => issue.includes(SLUG)), []);
  assert.deepEqual(findEmptyDeckRoots(dir, [SLUG]).filter((entry) => entry.includes(SLUG)), []);
});

test("without the list the same shells are reported as pages missing a canonical", () => {
  const dir = shellDist([SLUG]);

  assert.ok(findCanonicalIssues(dir, []).some((issue) => issue.includes(SLUG)));
});
