const test = require("node:test");
const assert = require("node:assert");
const {
  buildRouteError,
  createPrerenderPage,
  mapWithConcurrency,
  openDocument,
  readTemplate,
} = require("../prerender-shared");

const makeFakePage = (url) => {
  const listeners = new Map();
  return {
    url: () => url,
    on: (event, listener) => {
      const eventListeners = listeners.get(event) ?? [];
      eventListeners.push(listener);
      listeners.set(event, eventListeners);
    },
    emit: (event, ...args) => {
      for (const listener of listeners.get(event) ?? []) listener(...args);
    },
    setUserAgent: async () => {},
    setRequestInterception: async () => {},
  };
};

test("maps every item with no more lanes running than the concurrency", async () => {
  let active = 0;
  let peak = 0;
  const seen = [];
  await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (item) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    seen.push(item);
    active -= 1;
  });
  assert.deepStrictEqual(seen.sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7]);
  assert.strictEqual(peak, 3);
});

test("rethrows the first failure and starts no further items", async () => {
  const started = [];
  await assert.rejects(
    mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async (item) => {
      started.push(item);
      if (item === 2) throw new Error("deck 2 broke");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }),
    /deck 2 broke/
  );
  assert.deepStrictEqual(started, [1, 2]);
});

test("reads the theme colour, modulepreloads and scripts from the template", () => {
  const template = readTemplate(
    '<head><meta name="theme-color" content="#abcdef">' +
      '<link rel="modulepreload" href="/assets/a.js">' +
      '<link rel="stylesheet" href="/app.css"></head>' +
      '<body><script type="module" src="/assets/index.js"></script></body>'
  );
  assert.strictEqual(template.themeColor, "#abcdef");
  assert.deepStrictEqual(template.preloads, ["/assets/a.js"]);
  assert.deepStrictEqual(template.scripts, ["/assets/index.js"]);
});

test("buildRouteError keeps route diagnostics and omits empty sections", () => {
  const route = "/deck/failing/";
  const cause = new Error("navigation timed out");
  const consoleMessages = Array.from({ length: 12 }, (_, index) => ({
    type: "warning",
    text: `console-message-${index}-` + "x".repeat(700),
  }));
  const error = buildRouteError({
    route,
    cause,
    pageErrors: ["http://127.0.0.1:4173/deck/failing/: app error"],
    consoleMessages,
    failedRequests: [
      { url: "https://assets.invalid/card.webp", errorText: "net::ERR_FAILED" },
    ],
  });
  assert.ok(error.message.includes(route));
  assert.ok(error.message.includes(cause.message));
  assert.ok(error.message.includes("app error"));
  assert.ok(error.message.includes("[warning] console-message-11"));
  assert.ok(!error.message.includes("console-message-0-x"));
  assert.ok(!error.message.includes("x".repeat(501)));
  assert.ok(error.message.includes("https://assets.invalid/card.webp"));
  assert.ok(error.message.includes("net::ERR_FAILED"));
  assert.ok(
    error.message.indexOf("Route:") < error.message.indexOf("Cause:") &&
      error.message.indexOf("Cause:") < error.message.indexOf("Page errors:") &&
      error.message.indexOf("Page errors:") < error.message.indexOf("Console messages:") &&
      error.message.indexOf("Console messages:") < error.message.indexOf("Failed requests:")
  );
  assert.strictEqual(error.cause, cause);
  const empty = buildRouteError({
    route,
    cause,
    pageErrors: [],
    consoleMessages: [],
    failedRequests: [],
  });
  assert.doesNotMatch(empty.message, /Page errors:|Console messages:|Failed requests:/);
});

test("openDocument sets the explicit selector timeout", async () => {
  const calls = [];
  const page = {
    goto: async (url) => calls.push(["goto", url]),
    waitForSelector: async (...args) => calls.push(["selector", ...args]),
  };
  await openDocument(page, "/deck/timeout/");
  assert.deepStrictEqual(calls[1], [
    "selector",
    "#app-root > *, #root > *",
    { timeout: 20000 },
  ]);
});

test("openDocument adds route, page, console and request details to failures", async () => {
  const route = "/deck/failing/";
  const pageErrors = [];
  const page = makeFakePage(`http://127.0.0.1:4173${route}`);
  await createPrerenderPage({ newPage: async () => page }, pageErrors);
  for (let index = 0; index < 12; index += 1) {
    page.emit("console", {
      type: () => "warning",
      text: () => `console-message-${index}-` + "x".repeat(700),
    });
  }
  page.emit("requestfailed", {
    url: () => "https://assets.invalid/card.webp",
    failure: () => ({ errorText: "net::ERR_FAILED" }),
  });
  page.goto = async () => {
    page.emit("pageerror", new Error("app error"));
    throw new Error("navigation timed out");
  };
  await assert.rejects(openDocument(page, route), (error) => {
    assert.ok(error.message.includes(route));
    assert.ok(error.message.includes("navigation timed out"));
    assert.ok(error.message.includes("app error"));
    assert.ok(error.message.includes("console-message-11"));
    assert.ok(!error.message.includes("console-message-0-x"));
    assert.ok(error.message.includes("net::ERR_FAILED"));
    assert.strictEqual(error.cause.message, "navigation timed out");
    return true;
  });
  assert.deepStrictEqual(pageErrors, [
    `http://127.0.0.1:4173${route}: app error`,
  ]);
});
