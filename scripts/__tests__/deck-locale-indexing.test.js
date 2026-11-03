const test = require("node:test");
const assert = require("node:assert/strict");
const { renderDeckHtml } = require("../prerender-decks");
const { buildHubJobs, renderHubHtml } = require("../prerender-deck-hubs");
const { buildSitemap } = require("../generate-sitemap");

const template =
  '<!doctype html><html><head><meta charset="utf-8" />' +
  '<meta name="robots" content="index, follow, noimageai" />' +
  '<link rel="alternate" hreflang="ja" href="https://pocketdecks.top/ja/deck/stale/" />' +
  "<title>Old Title</title></head><body></body></html>";

const deck = {
  slug: "venusaur-ex-a1-004",
  title: "Venusaur ex | Pokémon TCG Pocket Deck Stats and Matchups",
  ogImage: "https://pocketdecks.top/og/deck/venusaur-ex-a1-004.png",
  description: "deck profile",
  cardId: "a1-004",
};

const hreflangs = (html) => [...html.matchAll(/hreflang="([^"]+)"/g)].map((match) => match[1]).sort();

test("Japanese deck pages are noindex, self-canonical and carry no hreflang", () => {
  const html = renderDeckHtml(deck, template, "ja");
  assert.match(html, /<meta name="robots" content="noindex, follow"\s*\/?>/);
  assert.match(html, /rel="canonical" href="https:\/\/pocketdecks\.top\/ja\/deck\/venusaur-ex-a1-004/);
  assert.deepStrictEqual(hreflangs(html), []);
});

test("English deck pages keep en and x-default hreflang and drop the ja alternate", () => {
  const html = renderDeckHtml(deck, template, "en");
  assert.deepStrictEqual(hreflangs(html), ["en", "x-default"]);
  assert.doesNotMatch(html, /stale/);
});

const archive = [
  {
    variant: "venusaur-ex-a1-004",
    hub: "venusaur-ex",
    name: "venusaur-ex-a1-004",
    firstSeen: "2025-10-31",
    lastSeen: "2026-09-09",
  },
];

test("Japanese hub pages are noindex, self-canonical and carry no hreflang", () => {
  const job = buildHubJobs(archive, [{ name: "venusaur-ex-a1-004" }])[0];
  const ja = renderHubHtml(job, template, "ja");
  assert.match(ja, /<meta name="robots" content="noindex, follow"\s*\/?>/);
  assert.match(ja, /rel="canonical" href="https:\/\/pocketdecks\.top\/ja\/deck\/venusaur-ex/);
  assert.deepStrictEqual(hreflangs(ja), []);
});

test("English hub pages keep en and x-default hreflang only", () => {
  const job = buildHubJobs(archive, [{ name: "venusaur-ex-a1-004" }])[0];
  assert.deepStrictEqual(hreflangs(renderHubHtml(job, template, "en")), ["en", "x-default"]);
});

test("the sitemap omits Japanese deck and hub pages", () => {
  const xml = buildSitemap({
    decks: [{ name: "venusaur-ex-a1-004" }],
    archive,
    lastmod: "2026-11-04",
  });
  assert.doesNotMatch(xml, /<loc>https:\/\/pocketdecks\.top\/ja\/deck\/[^<]/);
  assert.match(xml, /<loc>https:\/\/pocketdecks\.top\/ja\/tier-list\//);
});

test("the sitemap lists English deck and hub pages with en and x-default hreflang only", () => {
  const xml = buildSitemap({
    decks: [{ name: "venusaur-ex-a1-004" }],
    archive,
    lastmod: "2026-11-04",
  });
  for (const loc of ["https://pocketdecks.top/deck/venusaur-ex-a1-004/", "https://pocketdecks.top/deck/venusaur-ex/"]) {
    const block = xml.split("<url>").find((part) => part.includes(`<loc>${loc}</loc>`));
    assert.ok(block, loc);
    assert.deepStrictEqual(hreflangs(block), ["en", "x-default"], loc);
  }
});

const retiredArchive = [
  {
    variant: "retired-x-a1-001",
    hub: "retired-x",
    name: "Retired X-A1-001",
    firstSeen: "2025-01-01",
    lastSeen: "2025-02-01",
  },
];

test("a retired English hub is listed in the sitemap with en and x-default hreflang only", () => {
  const xml = buildSitemap({
    decks: [{ name: "venusaur-ex-a1-004" }],
    archive: [...archive, ...retiredArchive],
    lastmod: "2026-11-04",
  });
  const block = xml
    .split("<url>")
    .find((part) => part.includes("<loc>https://pocketdecks.top/deck/retired-x/</loc>"));
  assert.ok(block, "retired hub is missing from the sitemap");
  assert.deepStrictEqual(hreflangs(block), ["en", "x-default"]);
  assert.doesNotMatch(xml, /<loc>https:\/\/pocketdecks\.top\/ja\/deck\/retired-x\//);
});
