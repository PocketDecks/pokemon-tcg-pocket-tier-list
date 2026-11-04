const test = require("node:test");
const assert = require("node:assert/strict");
const { deckJob, renderDeckHtml } = require("../prerender-decks");

const template =
  '<!doctype html><html><head><meta charset="utf-8" />' +
  "<title>Old Title</title></head><body></body></html>";

const archive = [
  {
    variant: "mega-altaria-ex-b1-102",
    hub: "mega-altaria-ex",
    name: "mega-altaria-ex-b1-102",
    firstSeen: "2025-10-31",
    lastSeen: "2025-10-31",
  },
  {
    variant: "mega-altaria-ex-b1-102&espeon-b3a-020",
    hub: "mega-altaria-ex",
    name: "Mega Altaria ex-B1-102&Espeon-B3a-020",
    firstSeen: "2025-10-31",
    lastSeen: "2026-09-09",
  },
];

const breadcrumbOf = (html) => {
  const json = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1];
  return JSON.parse(json).itemListElement;
};

test("deck jobs carry the hub of their variant and the hub's display name", () => {
  const job = deckJob({ name: "mega-altaria-ex-b1-102", lists: [] }, archive);
  assert.deepStrictEqual(job.hub, { slug: "mega-altaria-ex", name: "Mega Altaria ex" });
});

test("deck jobs outside the archive have no hub", () => {
  const job = deckJob({ name: "garchomp-zz-999", lists: [] }, archive);
  assert.equal(job.hub, null);
});

test("the deck breadcrumb runs Home, Tier List, hub, variant", () => {
  const job = deckJob({ name: "mega-altaria-ex-b1-102", lists: [] }, archive);
  const items = breadcrumbOf(renderDeckHtml(job, template, "en"));
  assert.deepStrictEqual(
    items.map((item) => item.name),
    ["Home", "Tier List", "Mega Altaria ex", job.name]
  );
  assert.equal(items[2].item, "https://pocketdecks.top/deck/mega-altaria-ex/");
  assert.deepStrictEqual(
    items.map((item) => item.position),
    [1, 2, 3, 4]
  );
});

test("a variant without a hub keeps the three-step breadcrumb", () => {
  const job = deckJob({ name: "garchomp-zz-999", lists: [] }, archive);
  const items = breadcrumbOf(renderDeckHtml(job, template, "en"));
  assert.deepStrictEqual(
    items.map((item) => item.name),
    ["Home", "Tier List", job.name]
  );
});
