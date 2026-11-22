const fs = require("fs");
const http = require("http");
const path = require("path");
const puppeteer = require("puppeteer");

const PORT = 4173;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const PRERENDER_USER_AGENT = "prerender-routes";
const ROUTE_READY_TIMEOUT = 20000;
const CARD_DB_ORIGIN = "https://raw.githubusercontent.com/PocketDecks/pokemon-tcg-pocket-cards/";
const CARD_IMAGE_STUB = Buffer.from(
  "UklGRkAAAABXRUJQVlA4WAoAAAAQAAAAAAAAAAAAQUxQSAIAAAAAAFZQOCAYAAAAMAEAnQEqAQABAAFAJiWkAANwAP79NmgA",
  "base64"
);
const MAX_CONSOLE_MESSAGES = 10;
const DIAGNOSTIC_TEXT_LIMIT = 500;
const pageDiagnostics = new WeakMap();
const sharedPageErrorOwners = new WeakMap();

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webp": "image/webp",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain",
  ".xml": "application/xml",
  ".map": "application/json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const capDiagnosticText = (value) =>
  String(value ?? "").slice(0, DIAGNOSTIC_TEXT_LIMIT);

const getPageErrorOwners = (pageErrors) => {
  let owners = sharedPageErrorOwners.get(pageErrors);
  if (!owners) {
    owners = Array(pageErrors.length).fill(null);
    sharedPageErrorOwners.set(pageErrors, owners);
  } else if (owners.length < pageErrors.length) {
    owners.push(...Array(pageErrors.length - owners.length).fill(null));
  } else if (owners.length > pageErrors.length) {
    owners.length = pageErrors.length;
  }
  return owners;
};

const removePageErrorsForDocuments = (diagnostics, documentIds) => {
  const pageErrors = diagnostics.sharedPageErrors;
  const owners = getPageErrorOwners(pageErrors);
  for (let index = pageErrors.length - 1; index >= 0; index -= 1) {
    const owner = owners[index];
    if (
      owner?.pageId === diagnostics.pageId &&
      documentIds.has(owner.documentId)
    ) {
      pageErrors.splice(index, 1);
      owners.splice(index, 1);
    }
  }
  diagnostics.pageErrorRecords = diagnostics.pageErrorRecords.filter(
    ({ documentId }) => !documentIds.has(documentId)
  );
};

const buildRouteError = ({
  route,
  cause,
  pageErrors = [],
  consoleMessages = [],
  failedRequests = [],
}) => {
  const sections = [`Route: ${route}`, `Cause: ${cause?.message ?? String(cause)}`];
  if (pageErrors.length) sections.push(`Page errors:\n${pageErrors.join("\n")}`);
  if (consoleMessages.length) {
    sections.push(
      `Console messages:\n${consoleMessages
        .slice(-MAX_CONSOLE_MESSAGES)
        .map(({ type, text }) => `[${type}] ${capDiagnosticText(text)}`)
        .join("\n")}`
    );
  }
  if (failedRequests.length) {
    sections.push(
      `Failed requests:\n${failedRequests
        .map(
          ({ url, errorText }) =>
            `${capDiagnosticText(url)}: ${capDiagnosticText(errorText)}`
        )
        .join("\n")}`
    );
  }
  const error = new Error(sections.join("\n"));
  error.cause = cause;
  return error;
};

const startServer = (distDir, templateHtml) =>
  new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(new URL(req.url, ORIGIN).pathname);
      let filePath = path.join(distDir, urlPath);
      const relative = path.relative(distDir, filePath);
      if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        res.writeHead(403);
        return res.end();
      }
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(distDir, "index.html");
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        "Content-Type": MIME[ext] || "application/octet-stream",
      });
      if (path.basename(filePath) === "index.html") return res.end(templateHtml);
      fs.createReadStream(filePath)
        .on("error", () => res.end())
        .pipe(res);
    });
    server.listen(PORT, "127.0.0.1", () => resolve(server));
  });

const readTemplate = (html) => ({
  html,
  themeColor:
    html.match(/<meta\s+name=["']theme-color["']\s+content=["']([^"']*)["']/i)?.[1] ?? "#121210",
  preloads: [...html.matchAll(/<link\b[^>]*>/gi)]
    .map((match) => match[0])
    .filter((tag) => /rel=["']modulepreload["']/i.test(tag))
    .map((tag) => (tag.match(/href=["']([^"']*)["']/i) || [])[1])
    .filter((href) => href !== undefined),
  scripts: [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']*)["'][^>]*>/gi)].map(
    (match) => match[1]
  ),
});

const resetPrerenderTheme = (originalThemeColor) => {
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.classList.remove("c15t-dark", "c15t-light");
  document.documentElement.style.removeProperty("color-scheme");
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    "content",
    originalThemeColor
  );
};

const resetPrerenderAppState = () => {
  const root = document.documentElement;
  delete root.dataset.routeReady;
  root.removeAttribute("data-app-visible");
  root.removeAttribute("data-consent-pending");
  root.style.removeProperty("--ad-anchor-h");
};

const launchBrowser = () =>
  puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

const createPrerenderPage = async (target, pageErrors = []) => {
  const page = await target.newPage();
  const diagnostics = {
    pageId: Symbol(),
    currentDocumentId: Symbol(),
    pageErrorRecords: [],
    consoleMessages: [],
    failedRequests: [],
    sharedPageErrors: pageErrors,
    currentAttempt: null,
  };
  getPageErrorOwners(pageErrors);
  pageDiagnostics.set(page, diagnostics);
  await page.setUserAgent(PRERENDER_USER_AGENT);
  page.on("framenavigated", (frame) => {
    if (frame !== page.mainFrame()) return;
    diagnostics.currentDocumentId = Symbol();
    diagnostics.currentAttempt?.documentIds.add(diagnostics.currentDocumentId);
  });
  page.on("pageerror", (err) => {
    const message = `${page.url()}: ${err.message}`;
    const owners = getPageErrorOwners(pageErrors);
    pageErrors.push(message);
    const pageError = {
      message,
      documentId: diagnostics.currentDocumentId,
    };
    owners.push({
      pageId: diagnostics.pageId,
      documentId: pageError.documentId,
    });
    diagnostics.pageErrorRecords.push(pageError);
    diagnostics.currentAttempt?.pageErrors.push(pageError);
  });
  page.on("console", (message) => {
    diagnostics.consoleMessages.push({
      type: message.type(),
      text: message.text(),
    });
    if (diagnostics.consoleMessages.length > MAX_CONSOLE_MESSAGES) {
      diagnostics.consoleMessages.shift();
    }
  });
  page.on("requestfailed", (request) => {
    diagnostics.failedRequests.push({
      url: request.url(),
      errorText: request.failure()?.errorText ?? "Request failed",
    });
  });

  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const url = req.url();
    if (url.startsWith(ORIGIN)) return req.continue();
    if (url.startsWith(CARD_DB_ORIGIN)) {
      const extension = path.extname(new URL(url).pathname).toLowerCase();
      return req.respond({
        status: 200,
        headers: {
          "content-type": MIME[extension] || "application/octet-stream",
        },
        body: CARD_IMAGE_STUB,
      });
    }
    return req.abort();
  });
  return page;
};

const retryOnce = async (work, { onRetry } = {}) => {
  try {
    return await work();
  } catch (error) {
    if (onRetry) await onRetry(error);
    return work();
  }
};

const runWithRouteRetry = async (
  page,
  route,
  work,
  { beforeRetry, seedCurrentDocument = false } = {}
) => {
  const diagnostics = pageDiagnostics.get(page);
  const attempts = [];
  const runAttempt = () => {
    const attempt = {
      documentIds: new Set(
        diagnostics && seedCurrentDocument ? [diagnostics.currentDocumentId] : []
      ),
      pageErrors: [],
    };
    attempts.push(attempt);
    if (diagnostics) diagnostics.currentAttempt = attempt;
    return Promise.resolve()
      .then(work)
      .finally(() => {
        if (diagnostics?.currentAttempt === attempt) {
          diagnostics.currentAttempt = null;
        }
      });
  };
  try {
    const result = await retryOnce(runAttempt, {
      onRetry: async (error) => {
        console.warn(`Retrying route ${route}: ${error?.message ?? String(error)}`);
        await beforeRetry?.(error);
      },
    });
    if (diagnostics && attempts.length > 1 && attempts.at(-1).pageErrors.length === 0) {
      const previousDocumentIds = new Set(
        attempts.slice(0, -1).flatMap((attempt) => [...attempt.documentIds])
      );
      const currentDocumentId = diagnostics.currentDocumentId;
      const replacementLoaded =
        attempts.at(-1).documentIds.has(currentDocumentId) &&
        !previousDocumentIds.has(currentDocumentId);
      if (replacementLoaded) {
        previousDocumentIds.delete(currentDocumentId);
        removePageErrorsForDocuments(diagnostics, previousDocumentIds);
      }
    }
    return result;
  } catch (cause) {
    throw buildRouteError({
      route,
      cause,
      pageErrors: diagnostics
        ? diagnostics.pageErrorRecords.map(({ message }) => message)
        : attempts.flatMap((attempt) =>
            attempt.pageErrors.map(({ message }) => message)
          ),
      consoleMessages: diagnostics?.consoleMessages,
      failedRequests: diagnostics?.failedRequests,
    });
  }
};

const openDocument = (page, route) =>
  runWithRouteRetry(page, route, async () => {
    await page.goto(`${ORIGIN}${route}`, { waitUntil: "networkidle0" });
    await page.waitForSelector("#app-root > *, #root > *", {
      timeout: ROUTE_READY_TIMEOUT,
    });
  });

const waitForRouteReady = (page) =>
  (() => {
    let reloadForRetry = false;
    const pageUrl = typeof page.url === "function" ? page.url() : "";
    const route = pageUrl ? new URL(pageUrl).pathname : "unknown route";
    return runWithRouteRetry(
      page,
      route,
      async () => {
        if (reloadForRetry) {
          reloadForRetry = false;
          await page.reload({ waitUntil: "networkidle0" });
        }
        return page.waitForFunction(
          () =>
            document.documentElement.dataset.routeReady ===
            window.location.pathname,
          { timeout: ROUTE_READY_TIMEOUT }
        );
      },
      {
        beforeRetry: () => { reloadForRetry = true; },
        seedCurrentDocument: true,
      }
    );
  })();

const captureDocument = async (page, template) => {
  await page.evaluate(() => {
    document.querySelectorAll("style[data-styled]").forEach((el) => {
      el.textContent = Array.from(el.sheet.cssRules, (rule) => rule.cssText).join("\n");
    });
  });
  await page.evaluate(
    (preloads, scripts) => {
      const allowedPreloads = new Set(preloads);
      const allowedScripts = new Set(scripts);
      document.querySelectorAll('link[rel="modulepreload"]').forEach((el) => {
        if (!allowedPreloads.has(el.getAttribute("href"))) el.remove();
      });
      document.querySelectorAll("script[src]").forEach((el) => {
        if (!allowedScripts.has(el.getAttribute("src"))) el.remove();
      });
    },
    template.preloads,
    template.scripts
  );
  await page.evaluate(resetPrerenderTheme, template.themeColor);
  await page.evaluate(resetPrerenderAppState);
  const html = await page.evaluate(
    () => `<!doctype html>\n${document.documentElement.outerHTML}`
  );
  return html.split(ORIGIN).join("");
};

const mapWithConcurrency = async (items, concurrency, worker) => {
  const queue = [...items];
  let failure = null;
  const lanes = Array.from(
    { length: Math.min(concurrency, items.length) },
    async (_, lane) => {
      while (queue.length > 0 && failure === null) {
        const item = queue.shift();
        try {
          await worker(item, lane);
        } catch (err) {
          failure = err;
          queue.length = 0;
        }
      }
    }
  );
  await Promise.all(lanes);
  if (failure !== null) throw failure;
};

module.exports = {
  buildRouteError,
  captureDocument,
  createPrerenderPage,
  launchBrowser,
  mapWithConcurrency,
  openDocument,
  ORIGIN,
  PORT,
  readTemplate,
  retryOnce,
  resetPrerenderAppState,
  resetPrerenderTheme,
  startServer,
  waitForRouteReady,
};
