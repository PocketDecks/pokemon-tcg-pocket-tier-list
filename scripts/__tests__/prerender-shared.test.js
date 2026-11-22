const test = require("node:test");
const assert = require("node:assert");
const {
  buildRouteError,
  createPrerenderPage,
  mapWithConcurrency,
  openDocument,
  readTemplate,
  retryOnce,
  waitForRouteReady,
} = require("../prerender-shared");

const makeFakePage = (url) => {
  const listeners = new Map();
  const mainFrame = {};
  return {
    url: () => url,
    mainFrame: () => mainFrame,
    on: (event, listener) => {
      const eventListeners = listeners.get(event) ?? [];
      eventListeners.push(listener);
      listeners.set(event, eventListeners);
    },
    emit: (event, ...args) => {
      return (listeners.get(event) ?? []).map((listener) => listener(...args));
    },
    handlersFor: (event) => listeners.get(event) ?? [],
    setUserAgent: async () => {},
    setRequestInterception: async () => {},
  };
};

const makeFakeRequest = (url) => {
  const calls = { continued: 0, aborted: 0, responses: [] };
  return {
    url: () => url,
    continue: async () => {
      calls.continued += 1;
    },
    abort: async () => {
      calls.aborted += 1;
    },
    respond: async (response) => {
      calls.responses.push(response);
    },
    calls,
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
  page.goto = async () => {
    page.emit("framenavigated", page.mainFrame());
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
    `http://127.0.0.1:4173${route}: app error`,
  ]);
});

const captureWarnings = async (work) => {
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.map(String).join(" "));
  try {
    return { result: await work(), warnings };
  } finally {
    console.warn = originalWarn;
  }
};

test("retryOnce returns the first result without retrying", async () => {
  let calls = 0;
  const warnings = [];
  const result = await retryOnce(
    async () => {
      calls += 1;
      return "ready";
    },
    { onRetry: (error) => warnings.push(error) }
  );
  assert.strictEqual(result, "ready");
  assert.strictEqual(calls, 1);
  assert.deepStrictEqual(warnings, []);
});

test("retryOnce runs one retry after the first failure", async () => {
  let calls = 0;
  const warnings = [];
  const result = await retryOnce(
    async () => {
      calls += 1;
      if (calls === 1) throw new Error("first failure");
      return "ready";
    },
    { onRetry: (error) => warnings.push(error.message) }
  );
  assert.strictEqual(result, "ready");
  assert.strictEqual(calls, 2);
  assert.deepStrictEqual(warnings, ["first failure"]);
});

test("retryOnce rejects with the second failure", async () => {
  let calls = 0;
  const first = new Error("first failure");
  const second = new Error("second failure");
  const warnings = [];
  await assert.rejects(
    retryOnce(
      async () => {
        calls += 1;
        throw calls === 1 ? first : second;
      },
      { onRetry: (error) => warnings.push(error) }
    ),
    (error) => error === second
  );
  assert.strictEqual(calls, 2);
  assert.deepStrictEqual(warnings, [first]);
});

test("openDocument retries and removes only its failed page errors", async () => {
  const route = "/deck/retry/";
  const pageErrors = [];
  const page = makeFakePage(`http://127.0.0.1:4173${route}`);
  const otherPage = makeFakePage("http://127.0.0.1:4173/other/");
  await createPrerenderPage({ newPage: async () => page }, pageErrors);
  await createPrerenderPage({ newPage: async () => otherPage }, pageErrors);
  otherPage.emit("pageerror", new Error("other page error"));
  let gotoCalls = 0;
  page.goto = async () => {
    gotoCalls += 1;
    page.emit("framenavigated", page.mainFrame());
    if (gotoCalls === 1) {
      page.emit("pageerror", new Error("first page error"));
      throw new Error("connection reset");
    }
  };
  page.waitForSelector = async () => {};
  const { warnings } = await captureWarnings(() => openDocument(page, route));
  assert.strictEqual(gotoCalls, 2);
  assert.deepStrictEqual(pageErrors, [
    "http://127.0.0.1:4173/other/: other page error",
  ]);
  assert.strictEqual(warnings.length, 1);
  assert.ok(warnings[0].includes(route));
  assert.ok(warnings[0].includes("connection reset"));
});

test("openDocument keeps earlier route errors when a retry succeeds", async () => {
  const pageErrors = [];
  let currentUrl = "http://127.0.0.1:4173/a/";
  const page = makeFakePage(currentUrl);
  page.url = () => currentUrl;
  await createPrerenderPage({ newPage: async () => page }, pageErrors);
  page.emit("pageerror", new Error("earlier route error"));
  let gotoCalls = 0;
  page.goto = async () => {
    gotoCalls += 1;
    currentUrl = "http://127.0.0.1:4173/b/";
    page.emit("framenavigated", page.mainFrame());
    if (gotoCalls === 1) throw new Error("connection reset");
  };
  page.waitForSelector = async () => {};

  await captureWarnings(() => openDocument(page, "/b/"));

  assert.strictEqual(gotoCalls, 2);
  assert.deepStrictEqual(pageErrors, [
    "http://127.0.0.1:4173/a/: earlier route error",
  ]);
});

test("a revisited route preserves earlier errors and readiness uses its opened route", async () => {
  const pageErrors = [];
  let currentUrl = "http://127.0.0.1:4173/x/";
  let reportedUrl = currentUrl;
  const page = makeFakePage(currentUrl);
  page.url = () => reportedUrl;
  await createPrerenderPage({ newPage: async () => page }, pageErrors);
  let xVisits = 0;
  let xSelectorCalls = 0;
  page.goto = async (url) => {
    currentUrl = url;
    reportedUrl = url;
    const route = new URL(url).pathname;
    page.emit("framenavigated", page.mainFrame());
    if (route === "/x/") {
      xVisits += 1;
      if (xVisits === 1) page.emit("pageerror", new Error("first x visit error"));
      if (xVisits === 2) page.emit("pageerror", new Error("revisited x error"));
    } else {
      page.emit("pageerror", new Error("y visit error"));
    }
  };
  page.waitForSelector = async () => {
    if (xVisits === 2) {
      xSelectorCalls += 1;
      if (xSelectorCalls === 1) throw new Error("selector failed");
    }
  };

  await captureWarnings(() => openDocument(page, "/x/"));
  await captureWarnings(() => openDocument(page, "/y/"));
  await captureWarnings(() => openDocument(page, "/x/"));

  let readinessCalls = 0;
  let reloads = 0;
  page.waitForFunction = async () => {
    readinessCalls += 1;
    if (readinessCalls === 1) {
      page.emit("pageerror", new Error("readiness failed"));
      throw new Error("readiness failed");
    }
    return true;
  };
  page.reload = async () => {
    reloads += 1;
    reportedUrl = currentUrl;
    page.emit("framenavigated", page.mainFrame());
  };
  reportedUrl = "http://127.0.0.1:4173/y/";
  await captureWarnings(() => waitForRouteReady(page));

  assert.strictEqual(xVisits, 3);
  assert.strictEqual(xSelectorCalls, 1);
  assert.strictEqual(readinessCalls, 2);
  assert.strictEqual(reloads, 1);
  assert.deepStrictEqual(pageErrors, [
    "http://127.0.0.1:4173/x/: first x visit error",
    "http://127.0.0.1:4173/y/: y visit error",
  ]);
});

test("a page error before DOMContentLoaded clears after a clean retry", async () => {
  const pageErrors = [];
  const route = "/same/";
  const page = makeFakePage(`http://127.0.0.1:4173${route}`);
  page.url = () => `http://127.0.0.1:4173${route}`;
  await createPrerenderPage({ newPage: async () => page }, pageErrors);
  let gotoCalls = 0;
  page.goto = async () => {
    gotoCalls += 1;
    page.emit("framenavigated", page.mainFrame());
    if (gotoCalls === 1) {
      page.emit("pageerror", new Error("startup script error"));
      throw new Error("navigation interrupted");
    }
    page.emit("domcontentloaded");
  };
  page.waitForSelector = async () => {};

  await captureWarnings(() => openDocument(page, route));

  assert.deepStrictEqual(pageErrors, []);
});

test("a retry without a new document keeps errors from its earlier attempt", async () => {
  const pageErrors = [];
  const route = "/same/";
  const page = makeFakePage(`http://127.0.0.1:4173${route}`);
  page.url = () => `http://127.0.0.1:4173${route}`;
  await createPrerenderPage({ newPage: async () => page }, pageErrors);
  let gotoCalls = 0;
  page.goto = async () => {
    gotoCalls += 1;
    if (gotoCalls === 1) {
      page.emit("framenavigated", page.mainFrame());
      page.emit("pageerror", new Error("first document error"));
    }
  };
  page.waitForSelector = async () => {
    if (gotoCalls === 1) throw new Error("selector failed");
  };

  await captureWarnings(() => openDocument(page, route));

  assert.deepStrictEqual(pageErrors, [
    `http://127.0.0.1:4173${route}: first document error`,
  ]);
});

test("readiness keeps prior errors when its retry does not load a new document", async () => {
  const pageErrors = [];
  const route = "/same/";
  let currentUrl = `http://127.0.0.1:4173${route}`;
  const page = makeFakePage(currentUrl);
  page.url = () => currentUrl;
  await createPrerenderPage({ newPage: async () => page }, pageErrors);
  let gotoCalls = 0;
  page.goto = async () => {
    gotoCalls += 1;
    page.emit("framenavigated", page.mainFrame());
    page.emit("pageerror", new Error(`document ${gotoCalls} error`));
  };
  page.waitForSelector = async () => {
    if (gotoCalls === 1) throw new Error("selector failed");
  };

  await captureWarnings(() => openDocument(page, route));

  const expectedErrors = [
    `http://127.0.0.1:4173${route}: document 1 error`,
    `http://127.0.0.1:4173${route}: document 2 error`,
  ];
  assert.deepStrictEqual(pageErrors, expectedErrors);
  let readinessCalls = 0;
  page.waitForFunction = async () => {
    readinessCalls += 1;
    if (readinessCalls === 1) throw new Error("readiness failed");
    return true;
  };
  page.reload = async () => {};

  await captureWarnings(() => waitForRouteReady(page));

  assert.deepStrictEqual(pageErrors, expectedErrors);
});

test("openDocument reports console and request diagnostics only from its route", async () => {
  let currentUrl = "http://127.0.0.1:4173/";
  const page = makeFakePage(currentUrl);
  page.url = () => currentUrl;
  await createPrerenderPage({ newPage: async () => page });
  page.goto = async (url) => {
    currentUrl = url;
    page.emit("framenavigated", page.mainFrame());
    const route = new URL(url).pathname;
    page.emit("console", {
      type: () => "error",
      text: () => `${route} console error`,
    });
    page.emit("requestfailed", {
      url: () => `${url}asset.js`,
      failure: () => ({ errorText: `${route} request failed` }),
    });
    if (route === "/b/") throw new Error("route B failed");
  };
  page.waitForSelector = async () => {};
  await openDocument(page, "/a/");

  await assert.rejects(openDocument(page, "/b/"), (error) => {
    assert.ok(error.message.includes("/b/ console error"));
    assert.ok(error.message.includes("/b/asset.js"));
    assert.ok(!error.message.includes("/a/ console error"));
    assert.ok(!error.message.includes("/a/asset.js"));
    return true;
  });
});

test("openDocument reports only page errors from its route", async () => {
  const pageErrors = [];
  let currentUrl = "http://127.0.0.1:4173/a/";
  const page = makeFakePage(currentUrl);
  page.url = () => currentUrl;
  await createPrerenderPage({ newPage: async () => page }, pageErrors);
  page.emit("pageerror", new Error("earlier route error"));
  page.goto = async (url) => {
    currentUrl = url;
    page.emit("framenavigated", page.mainFrame());
    page.emit("pageerror", new Error("current route error"));
    throw new Error("navigation failed");
  };

  await assert.rejects(openDocument(page, "/b/"), (error) => {
    assert.ok(error.message.includes("/b/: current route error"));
    assert.ok(!error.message.includes("/a/: earlier route error"));
    return true;
  });

  assert.deepStrictEqual(pageErrors, [
    "http://127.0.0.1:4173/a/: earlier route error",
    "http://127.0.0.1:4173/b/: current route error",
    "http://127.0.0.1:4173/b/: current route error",
  ]);
});

test("openDocument caps failed request diagnostics", async () => {
  const page = makeFakePage("http://127.0.0.1:4173/many/");
  await createPrerenderPage({ newPage: async () => page });
  let gotoCalls = 0;
  page.goto = async () => {
    gotoCalls += 1;
    page.emit("framenavigated", page.mainFrame());
    for (let index = 0; index < 12; index += 1) {
      const number = (gotoCalls - 1) * 12 + index;
      page.emit("requestfailed", {
        url: () => `http://127.0.0.1:4173/many/request-${number}.js`,
        failure: () => ({ errorText: "request failed" }),
      });
    }
    throw new Error("route failed");
  };

  await assert.rejects(openDocument(page, "/many/"), (error) => {
    const requests = error.message.split("Failed requests:\n")[1].split("\n");
    assert.strictEqual(requests.length, 10);
    assert.ok(requests[0].includes("request-14.js"));
    assert.ok(requests.at(-1).includes("request-23.js"));
    return true;
  });
});

test("openDocument retains old document errors when its replacement reports an error", async () => {
  const route = "/deck/retry-error/";
  const pageErrors = [];
  const page = makeFakePage(`http://127.0.0.1:4173${route}`);
  await createPrerenderPage({ newPage: async () => page }, pageErrors);
  let gotoCalls = 0;
  page.goto = async () => {
    gotoCalls += 1;
    page.emit("framenavigated", page.mainFrame());
    page.emit("pageerror", new Error(`document error ${gotoCalls}`));
    if (gotoCalls === 1) throw new Error("connection reset");
  };
  page.waitForSelector = async () => {};
  await captureWarnings(() => openDocument(page, route));
  assert.deepStrictEqual(pageErrors, [
    `http://127.0.0.1:4173${route}: document error 1`,
    `http://127.0.0.1:4173${route}: document error 2`,
  ]);
});

test("a clean reload clears errors from discarded route documents only", async () => {
  const pageErrors = [];
  let currentUrl = "http://127.0.0.1:4173/a/";
  const page = makeFakePage(currentUrl);
  const otherPage = makeFakePage("http://127.0.0.1:4173/other/");
  page.url = () => currentUrl;
  await createPrerenderPage({ newPage: async () => page }, pageErrors);
  await createPrerenderPage({ newPage: async () => otherPage }, pageErrors);
  page.emit("pageerror", new Error("earlier route error"));
  otherPage.emit("pageerror", new Error("other page error"));

  let gotoCalls = 0;
  let readinessCalls = 0;
  let reloads = 0;
  page.goto = async (url) => {
    gotoCalls += 1;
    currentUrl = url;
    page.emit("framenavigated", page.mainFrame());
    page.emit("pageerror", new Error(`document ${gotoCalls} error`));
  };
  page.waitForSelector = async () => {
    if (gotoCalls === 1) throw new Error("selector failed");
  };
  page.waitForFunction = async () => {
    readinessCalls += 1;
    if (readinessCalls === 1) throw new Error("route readiness failed");
    return true;
  };
  page.reload = async () => {
    reloads += 1;
    page.emit("framenavigated", page.mainFrame());
  };

  await captureWarnings(async () => {
    await openDocument(page, "/b/");
    return waitForRouteReady(page);
  });

  assert.strictEqual(gotoCalls, 2);
  assert.strictEqual(readinessCalls, 2);
  assert.strictEqual(reloads, 1);
  assert.deepStrictEqual(pageErrors, [
    "http://127.0.0.1:4173/a/: earlier route error",
    "http://127.0.0.1:4173/other/: other page error",
  ]);
});

test("openDocument includes both page attempts when retry also fails", async () => {
  const route = "/deck/retry-fails/";
  const pageErrors = [];
  const page = makeFakePage(`http://127.0.0.1:4173${route}`);
  const otherPage = makeFakePage("http://127.0.0.1:4173/other/");
  await createPrerenderPage({ newPage: async () => page }, pageErrors);
  await createPrerenderPage({ newPage: async () => otherPage }, pageErrors);
  otherPage.emit("pageerror", new Error("other page error"));
  let gotoCalls = 0;
  page.goto = async () => {
    gotoCalls += 1;
    page.emit("framenavigated", page.mainFrame());
    page.emit("pageerror", new Error(`page error ${gotoCalls}`));
    throw new Error(`navigation attempt ${gotoCalls} failed`);
  };
  const { warnings } = await captureWarnings(() =>
    assert.rejects(openDocument(page, route), (error) => {
      assert.ok(error.message.includes(route));
      assert.ok(error.message.includes("page error 1"));
      assert.ok(error.message.includes("page error 2"));
      assert.ok(error.message.includes("navigation attempt 1 failed"));
      assert.ok(error.message.includes("navigation attempt 2 failed"));
      assert.strictEqual(error.cause.message, "navigation attempt 2 failed");
      return true;
    })
  );
  assert.strictEqual(gotoCalls, 2);
  assert.strictEqual(warnings.length, 1);
  assert.deepStrictEqual(pageErrors, [
    "http://127.0.0.1:4173/other/: other page error",
    `http://127.0.0.1:4173${route}: page error 1`,
    `http://127.0.0.1:4173${route}: page error 2`,
  ]);
});

test("waitForRouteReady reloads once after its first timeout", async () => {
  const route = "/deck/ready/";
  const pageErrors = [];
  const page = makeFakePage(`http://127.0.0.1:4173${route}`);
  await createPrerenderPage({ newPage: async () => page }, pageErrors);
  let waits = 0;
  let reloads = 0;
  let reloadOptions;
  page.waitForFunction = async () => {
    waits += 1;
    if (waits === 1) {
      page.emit("pageerror", new Error("route not ready on first wait"));
      throw new Error("route wait timed out");
    }
    return true;
  };
  page.reload = async (options) => {
    reloads += 1;
    reloadOptions = options;
    page.emit("framenavigated", page.mainFrame());
  };
  const { result, warnings } = await captureWarnings(() => waitForRouteReady(page));
  assert.strictEqual(result, true);
  assert.strictEqual(waits, 2);
  assert.strictEqual(reloads, 1);
  assert.deepStrictEqual(reloadOptions, { waitUntil: "networkidle0" });
  assert.deepStrictEqual(pageErrors, []);
  assert.strictEqual(warnings.length, 1);
  assert.ok(warnings[0].includes(route));
  assert.ok(warnings[0].includes("route wait timed out"));
});

test("waitForRouteReady retains page errors from the successful document load", async () => {
  const route = "/deck/page-error/";
  const pageErrors = [];
  const page = makeFakePage(`http://127.0.0.1:4173${route}`);
  await createPrerenderPage({ newPage: async () => page }, pageErrors);
  page.goto = async () => {
    page.emit("framenavigated", page.mainFrame());
    page.emit("pageerror", new Error("fixture page exploded"));
  };
  page.waitForSelector = async () => {};
  page.waitForFunction = async () => {
    throw new Error("route wait timed out");
  };
  page.reload = async () => {
    page.emit("framenavigated", page.mainFrame());
  };
  const { result } = await captureWarnings(() =>
    assert.rejects(
      async () => {
        await openDocument(page, route);
        await waitForRouteReady(page);
      },
      (error) => {
        assert.ok(error.message.includes(route));
        assert.ok(error.message.includes("fixture page exploded"));
        assert.strictEqual(error.cause.message, "route wait timed out");
        return true;
      }
    )
  );
  assert.strictEqual(result, undefined);
  assert.deepStrictEqual(pageErrors, [
    `http://127.0.0.1:4173${route}: fixture page exploded`,
  ]);
});

test("request interception continues local files, stubs card images and aborts other hosts", async () => {
  const page = makeFakePage("http://127.0.0.1:4173/deck/cards/");
  await createPrerenderPage({ newPage: async () => page }, []);
  const [requestHandler] = page.handlersFor("request");
  const localRequest = makeFakeRequest("http://127.0.0.1:4173/assets/app.js");
  await requestHandler(localRequest);
  assert.strictEqual(localRequest.calls.continued, 1);
  assert.strictEqual(localRequest.calls.aborted, 0);
  const cardRequest = makeFakeRequest(
    "https://raw.githubusercontent.com/PocketDecks/pokemon-tcg-pocket-cards/refs/heads/main/images/webp/cards/a1/001.webp"
  );
  await requestHandler(cardRequest);
  assert.strictEqual(cardRequest.calls.continued, 0);
  assert.strictEqual(cardRequest.calls.aborted, 0);
  assert.strictEqual(cardRequest.calls.responses.length, 1);
  assert.strictEqual(cardRequest.calls.responses[0].status, 200);
  assert.strictEqual(cardRequest.calls.responses[0].headers["content-type"], "image/webp");
  assert.ok(Buffer.isBuffer(cardRequest.calls.responses[0].body));
  assert.ok(cardRequest.calls.responses[0].body.length > 0);
  for (const traversalUrl of [
    "https://raw.githubusercontent.com/PocketDecks/pokemon-tcg-pocket-cards/../../../../etc/passwd",
    "https://raw.githubusercontent.com/PocketDecks/pokemon-tcg-pocket-cards/%2e%2e/%2e%2e/etc/passwd",
  ]) {
    const traversalRequest = makeFakeRequest(traversalUrl);
    await requestHandler(traversalRequest);
    assert.strictEqual(traversalRequest.calls.continued, 0);
    assert.strictEqual(traversalRequest.calls.aborted, 0);
    assert.strictEqual(traversalRequest.calls.responses.length, 1);
  }
  const externalRequest = makeFakeRequest("https://example.invalid/other.js");
  await requestHandler(externalRequest);
  assert.strictEqual(externalRequest.calls.aborted, 1);
  assert.strictEqual(externalRequest.calls.continued, 0);
  assert.strictEqual(externalRequest.calls.responses.length, 0);
});
