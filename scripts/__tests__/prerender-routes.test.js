const test = require("node:test");
const assert = require("node:assert");
const { ROUTES, ROUTE_META, ROUTE_READY_ROUTES } = require("../prerender-routes");

test("every route has unique title and description, plus self canonical", () => {
  const titles = new Set();
  const descriptions = new Set();
  for (const route of ROUTES) {
    const meta = ROUTE_META[route];
    assert.ok(meta, `no metadata for ${route}`);
    assert.ok(meta.title.length >= 15 && meta.title.length <= 65, `bad title length for ${route}: ${meta.title.length}`);
    assert.ok(meta.description.length >= 70 && meta.description.length <= 165, `bad description length for ${route}: ${meta.description.length}`);
    assert.strictEqual(meta.canonical, `https://pocketdecks.top${route === "/" ? "/" : route + "/"}`);
    titles.add(meta.title);
    descriptions.add(meta.description);
  }
  assert.strictEqual(titles.size, ROUTES.length, "duplicate titles across routes");
  assert.strictEqual(descriptions.size, ROUTES.length, "duplicate descriptions across routes");
});

test("waits for route content on data-backed pages", () => {
  assert.deepStrictEqual([...ROUTE_READY_ROUTES], ["/cards-list", "/statistics", "/deck"]);
});
