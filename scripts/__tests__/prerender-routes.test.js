const test = require("node:test");
const assert = require("node:assert");
const {
  captureAfterRouteReady,
  ROUTES,
  ROUTE_META,
  ROUTE_READY_ROUTES,
} = require("../prerender-routes");

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

test("captures data-backed routes after their pathname is ready", async () => {
  const events = [];
  const page = {
    waitForFunction: async (predicate, options) => {
      events.push("wait");
      assert.strictEqual(options.timeout, 20000);
      global.document = { documentElement: { dataset: { routeReady: "/wrong" } } };
      global.window = { location: { pathname: "/statistics" } };
      assert.strictEqual(predicate(), false);
      global.document.documentElement.dataset.routeReady = "/statistics";
      assert.strictEqual(predicate(), true);
      events.push("ready");
    },
  };

  const html = await captureAfterRouteReady(page, "/statistics", () => {
    events.push("capture");
    return "<html></html>";
  });

  assert.strictEqual(html, "<html></html>");
  assert.deepStrictEqual(events, ["wait", "ready", "capture"]);
  delete global.document;
  delete global.window;
});
