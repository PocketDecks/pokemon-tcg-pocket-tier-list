const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert");

const { buildSitemap, escapeXml } = require("../generate-sitemap");
const { deckSlug } = require("../deck-slug.mjs");

const FIXTURE_DECKS = [
  { name: "venusaur-ex-a1-004" },
  { name: "butterfree-b3b-003" },
  { name: "suicune-ex-a4a-020&baxcalibur-b2a-036" },
  { name: "Greninja ex & Oricorio" },
];
test("deck slugs remove punctuation without creating separators", () => {
  assert.strictEqual(
    deckSlug("Professor's Research-PA-007"),
    "professors-research-pa-007"
  );
  assert.strictEqual(deckSlug("Porygon.Z! PA-007"), "porygonz-pa-007");
  assert.strictEqual(deckSlug("Ho-Oh/PA-007"), "ho-ohpa-007");
});

test("current names retain their existing slugs", () => {
  const decks = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "..", "public", "data", "best-decks.json"), "utf8")
  );
  for (const deck of decks) {
    assert.strictEqual(
      deckSlug(deck.name),
      deck.name.toLowerCase().replace(/\s/g, "-"),
      deck.name
    );
  }
});

const LASTMOD = "2026-08-22";

test("shared helper turns names into route slugs", () => {
  assert.strictEqual(deckSlug("Greninja ex & Oricorio"), "greninja-ex-&-oricorio");
});

test("every fixture deck gets a route, single- and double-card alike", () => {
  const xml = buildSitemap({ decks: FIXTURE_DECKS, lastmod: LASTMOD });
  for (const deck of FIXTURE_DECKS) {
    assert.ok(
      xml.includes(
        `<loc>https://pocketdecks.top/deck/${escapeXml(deckSlug(deck.name))}/</loc>`
      ),
      `missing route for "${deck.name}"`
    );
  }
});

test("compound deck names retain '&' in the slug before XML escaping", () => {
  const xml = buildSitemap({ decks: FIXTURE_DECKS, lastmod: LASTMOD });
  assert.ok(
    xml.includes("<loc>https://pocketdecks.top/deck/suicune-ex-a4a-020&amp;baxcalibur-b2a-036/</loc>"),
    "compound '&' should be escaped to &amp; inside <loc>"
  );
});

test("no raw ampersands remain anywhere in the XML output", () => {
  const xml = buildSitemap({ decks: FIXTURE_DECKS, lastmod: LASTMOD });
  assert.doesNotMatch(xml, /&(?!amp;|lt;|gt;|quot;|apos;|#)/);
});
