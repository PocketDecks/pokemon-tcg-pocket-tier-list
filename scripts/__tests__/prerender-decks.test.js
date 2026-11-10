// scripts/__tests__/prerender-decks.test.js
const test = require("node:test");
const assert = require("node:assert");
const { jobsForLiveDecks, renderDeckHtml, friendlyName, slugFor } = require("../prerender-decks");

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
  assert.strictEqual((html.match(/<meta name="description"/g) ?? []).length, 1);
  assert.ok(!html.includes('content="old og"'));
});

test("renders a high-priority preload for the first card, matching its sizes", () => {
  const html = renderDeckHtml(
    {
      slug: "mega-altaria-ex-b1-102&espeon-b3a-020",
      title: "Mega Altaria ex | Pokémon TCG Pocket Deck Stats and Matchups",
      ogImage: "https://pocketdecks.top/og/deck/x.png",
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

test("a Japanese deck breadcrumb links and labels in Japanese", () => {
  const html = renderDeckHtml(
    {
      slug: "suicune-ex-a4a-020&baxcalibur-b2a-036",
      name: "Suicune ex & Baxcalibur",
      title: "Suicune ex & Baxcalibur | Pokémon TCG Pocket Deck Stats and Matchups",
      ogImage: "https://pocketdecks.top/og/deck/x.png",
      description: "deck profile",
      cardId: "a4a-020",
    },
    template,
    "ja"
  );
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.strictEqual(blocks.length, 1);
  const jsonLd = JSON.parse(blocks[0][1].replace(/\u0026/g, "&").replace(/\u003c/g, "<").replace(/\u003e/g, ">"));
  const [home, tierList, deck] = jsonLd.itemListElement;
  assert.strictEqual(jsonLd["@type"], "BreadcrumbList");
  assert.strictEqual(home.name, "ホーム");
  assert.strictEqual(home.item, "https://pocketdecks.top/ja/");
  assert.strictEqual(tierList.name, "ティアリスト");
  assert.strictEqual(tierList.item, "https://pocketdecks.top/ja/tier-list/");
  assert.strictEqual(deck.name, "Suicune ex & Baxcalibur");
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

test("every live deck gets a prerender job, including one whose lists yield no card id", () => {
  const decks = [
    { name: "mega-altaria-ex-b1-102&espeon-b3a-020", lists: [{ score: 3, cards: ["2:b1-184"] }] },
    { name: "garchomp-zz-999", lists: [] },
  ];
  const jobs = jobsForLiveDecks(decks, []);
  assert.deepStrictEqual(
    jobs.map((job) => job.slug),
    [slugFor(decks[0].name), slugFor(decks[1].name)]
  );
  assert.strictEqual(jobs[0].cardId, "b1-184");
  assert.strictEqual(jobs[1].cardId, null);
  assert.match(jobs[0].description, /deck code and QR code/);
});

test("a deck without a card id renders in both locales with no lead-card image preload", () => {
  const [job] = jobsForLiveDecks([{ name: "garchomp-zz-999", lists: [] }], []);
  for (const locale of ["en", "ja"]) {
    const html = renderDeckHtml(job, template, locale);
    assert.ok(html.includes(`<title>${friendlyName(job.name)}`));
    assert.ok(html.includes(`property="og:image" content="https://pocketdecks.top/og/deck/${job.slug}.png"`));
    assert.deepStrictEqual(html.match(/<link rel="preload" as="image"[^>]*>/g) ?? [], []);
  }
});
