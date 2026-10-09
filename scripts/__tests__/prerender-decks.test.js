// scripts/__tests__/prerender-decks.test.js
const test = require("node:test");
const assert = require("node:assert");
const { renderDeckHtml, friendlyName, slugFor } = require("../prerender-decks");

const template =
  '<!doctype html><html><head><meta charset="utf-8" />' +
  '<meta name="description" content="old default" />' +
  '<meta property="og:title" content="old og" />' +
  "<title>Old Title</title></head><body></body></html>";

test("friendlyName orders ex card first, joining with ' & '", () => {
  assert.strictEqual(
    friendlyName("baxcalibur-b2a-036&suicune-ex-a4a-020"),
    "Suicune ex & Baxcalibur"
  );
  assert.strictEqual(
    friendlyName("venusaur-a1-004&bulbasaur-a1-001"),
    "Venusaur & Bulbasaur"
  );
});

test("slugFor matches the DecksContext route id formula", () => {
  assert.strictEqual(
    slugFor("Greninja & Oricorio"),
    "greninja-&-oricorio"
  );
});

test("renderDeckHtml injects per-deck title and OG tags, dropping the defaults", () => {
  const html = renderDeckHtml(
    {
      slug: "suicune-ex-a4a-020&baxcalibur-b2a-036",
      title: "Suicune ex & Baxcalibur | Pokémon TCG Pocket Deck Stats and Matchups",
      ogImage: "https://pocketdecks.top/og/deck/suicune-ex-a4a-020&baxcalibur-b2a-036.png",
      ogUrl: "https://pocketdecks.top/deck/suicune-ex-a4a-020&baxcalibur-b2a-036",
      description: "deck profile for Suicune ex & Baxcalibur",
      cardId: "a4a-020",
    },
    template
  );
  assert.ok(html.includes("<title>Suicune ex &amp; Baxcalibur"));
  assert.ok(html.includes('property="og:title" content="Suicune ex &amp; Baxcalibur'));
  assert.ok(html.includes('property="og:image" content="https://pocketdecks.top/og/deck/'));
  assert.ok(html.includes('property="og:url" content="https://pocketdecks.top/deck/'));
  assert.ok(html.includes('name="twitter:card" content="summary_large_image"'));
  assert.ok(!html.includes("Old Title"));
  assert.ok(!html.includes('content="old default"'));
  assert.ok(!html.includes('content="old og"'));
});

test("renders a high-priority preload for the first card, matching its sizes", () => {
  const html = renderDeckHtml(
    {
      slug: "mega-altaria-ex-b1-102&espeon-b3a-020",
      title: "Mega Altaria ex | Pokémon TCG Pocket Deck Stats and Matchups",
      ogImage: "https://pocketdecks.top/og/deck/x.png",
      ogUrl: "https://pocketdecks.top/deck/x",
      description: "deck profile",
      cardId: "b1-184",
    },
    template
  );
  const preloads = html.match(/<link rel="preload" as="image"[^>]*>/g) ?? [];
  assert.strictEqual(preloads.length, 1);
  assert.ok(
    preloads[0].includes(
      'imagesrcset="/thumbs/v3/cards/b1-184-120.webp?v=3 120w, /thumbs/v3/cards/b1-184-240.webp?v=3 240w"'
    )
  );
  assert.ok(preloads[0].includes('imagesizes="(max-width: 900px) calc(50vw - 36px), 240px"'));
  assert.ok(preloads[0].includes('fetchpriority="high"'));
});

test("keeps the captured deck list and replaces the captured canonical with the deck's own", () => {
  const captured =
    '<!doctype html><html><head><link rel="canonical" href="https://pocketdecks.top/">' +
    "<title>Deck</title></head>" +
    '<body><div id="root"><main>Deck list</main></div></body></html>';
  const html = renderDeckHtml(
    {
      slug: "mega-altaria-ex-b1-102&espeon-b3a-020",
      title: "Mega Altaria ex | Pokémon TCG Pocket Deck Stats and Matchups",
      ogImage: "https://pocketdecks.top/og/deck/x.png",
      ogUrl: "https://pocketdecks.top/deck/x",
      description: "deck profile",
      cardId: "b1-184",
    },
    captured
  );
  assert.ok(html.includes('<div id="root"><main>Deck list</main></div>'));
  const canonicals = html.match(/<link[^>]+rel="canonical"[^>]*>/g) ?? [];
  assert.deepStrictEqual(canonicals, [
    '<link rel="canonical" href="https://pocketdecks.top/deck/mega-altaria-ex-b1-102&amp;espeon-b3a-020/">',
  ]);
});
