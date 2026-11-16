const test = require("node:test");
const assert = require("node:assert");
const { PAGE_ROUTES, PRERENDER_ROUTES, SITEMAP_ROUTES, pageRouteFor } = require("../routes.mjs");

test("the static pages prerender and list in the sitemap in the same order", () => {
  assert.deepStrictEqual(PRERENDER_ROUTES, [
    "/",
    "/tier-list",
    "/cards-list",
    "/expansion-list",
    "/statistics",
    "/deck",
    "/about",
    "/premium",
    "/privacy",
  ]);
  assert.deepStrictEqual(SITEMAP_ROUTES, PRERENDER_ROUTES);
});

test("feedback and the parameter routes are not prerendered or listed", () => {
  for (const route of ["/feedback", "/expansion-list/:expansionId", "/deck/:deckId"]) {
    const entry = PAGE_ROUTES.find((item) => item.route === route);
    assert.ok(entry, `missing ${route}`);
    assert.ok(!entry.prerender && !entry.sitemap, `${route} should not be prerendered or listed`);
  }
});

test("pageRouteFor matches concrete paths to their manifest entry", () => {
  assert.strictEqual(pageRouteFor("/")?.element, "landing");
  assert.strictEqual(pageRouteFor("/deck")?.element, "deckFinder");
  assert.strictEqual(pageRouteFor("/deck/charizard")?.element, "deck");
  assert.strictEqual(pageRouteFor("/expansion-list")?.element, "expansionList");
  assert.strictEqual(pageRouteFor("/expansion-list/a2")?.element, "expansion");
  assert.strictEqual(pageRouteFor("/nowhere"), undefined);
  assert.strictEqual(pageRouteFor("/deck/a/b"), undefined);
});

test("the expansion page waits for data and the tier list waits for deck links", () => {
  const expansion = pageRouteFor("/expansion-list/a2");
  assert.strictEqual(expansion?.ready, true);
  assert.ok(!expansion.deckLinks, "the expansion page should not wait for deck links");

  const tierList = pageRouteFor("/tier-list");
  assert.strictEqual(tierList?.deckLinks, true);
  assert.ok(!tierList.ready, "the tier list should not use the readiness wait");
});
