const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const { createHash } = require("node:crypto");
const path = require("node:path");
const { findCspHashIssues, findCspBootstrapIssues } = require("../verify-dist-html");
const { makeDist } = require("./verify-dist-html-fixtures");

const cspFirebase = (scriptSrc, extra = []) => ({
  hosting: {
    headers: [
      {
        source: "**",
        headers: [
          ...(scriptSrc === null
            ? []
            : [{ key: "Content-Security-Policy", value: `default-src 'self'; script-src 'self' ${scriptSrc}; frame-ancestors 'none'` }]),
          ...extra,
        ],
      },
    ],
  },
});
const sha = (body) => `'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`;
const inlineHtml = (body) => `<html><head><script>${body}</script></head></html>`;

const cspBootstrap = 'const script=document.createElement("script");script.type="module";script.src="/app.js";document.head.append(script);';
const cspBootstrapHtml = `<html><body><div id="root"></div><script data-csp-bootstrap="true">${cspBootstrap}</script></body></html>`;

test("verifies valid shell and route bootstraps and rejects stale or missing ones", () => {
  const validDir = makeDist({
    "index.html": cspBootstrapHtml,
    "404.html": cspBootstrapHtml,
    "app-shell.html": cspBootstrapHtml,
    "ja/privacy/index.html": cspBootstrapHtml,
    "app.js": "import './assets/chunk.js';",
  });
  const firebase = cspWithPolicy(`script-src ${sha(cspBootstrap)} 'strict-dynamic'`);
  assert.deepStrictEqual(findCspBootstrapIssues(validDir, firebase), []);
  const wrongUrl = cspBootstrap.replace("/app.js", "/old-app.js");
  const invalidDir = makeDist({
    "index.html": cspBootstrapHtml,
    "404.html": `<html><script data-csp-bootstrap="true">${wrongUrl}</script></html>`,
    "ja/privacy/index.html": "<html><body></body></html>",
  });
  const issues = findCspBootstrapIssues(invalidDir, firebase);
  assert.ok(issues.includes("404.html: bootstrap must insert /app.js"));
  assert.ok(issues.includes(`404.html: bootstrap hash is not allowed by script-src`));
  assert.ok(issues.includes(`ja${path.sep}privacy${path.sep}index.html: expected one hash-authorised application bootstrap, found 0`));
  assert.ok(issues.includes("app.js: fixed application entry is missing"));
});

test("rejects a bootstrap placed before the application root", () => {
  const dir = makeDist({
    "index.html": `<html><body><script data-csp-bootstrap="true">${cspBootstrap}</script><div id="root"></div></body></html>`,
    "app.js": "document.querySelector('#root').dataset.loaded='true';",
  });
  const issues = findCspBootstrapIssues(dir, cspWithPolicy(`script-src ${sha(cspBootstrap)} 'strict-dynamic'`));
  assert.ok(issues.includes("index.html: bootstrap must follow the application root"));
});

test("rejects inert and nomodule bootstrap tags", () => {
  for (const attributes of ['type="application/json"', "nomodule"]) {
    const dir = makeDist({
      "index.html": `<html><body><div id="root"></div><script ${attributes} data-csp-bootstrap="true">${cspBootstrap}</script></body></html>`,
      "app.js": "document.querySelector('#root').dataset.loaded='true';",
    });
    assert.ok(findCspBootstrapIssues(dir, cspWithPolicy(`script-src ${sha(cspBootstrap)} 'strict-dynamic'`))
      .includes("index.html: bootstrap must be an inline classic script"));
  }
});

test("rejects a bootstrap policy missing strict-dynamic", () => {
  const dir = makeDist({
    "index.html": cspBootstrapHtml,
    "app.js": "import './assets/chunk.js';",
  });
  assert.deepStrictEqual(
    findCspBootstrapIssues(dir, cspWithPolicy(`script-src ${sha(cspBootstrap)}`)),
    ["script-src: 'strict-dynamic' is missing"]
  );
});

test("rejects a parser-inserted external script beside a valid bootstrap", () => {
  const html = `<html><head><script src="/untrusted.js"></script></head><body><div id="root"></div><script data-csp-bootstrap="true">${cspBootstrap}</script></body></html>`;
  const dir = makeDist({
    "index.html": html,
    "app.js": "import './assets/chunk.js';",
  });
  assert.deepStrictEqual(
    findCspBootstrapIssues(dir, cspWithPolicy(`script-src ${sha(cspBootstrap)} 'strict-dynamic'`)),
    ["index.html: parser-inserted external script remains"]
  );
});

test("rejects a parser-inserted modulepreload beside a valid bootstrap", () => {
  const html = `<html><head><link rel="modulepreload" href="/assets/chunk.js"></head><body><div id="root"></div><script data-csp-bootstrap="true">${cspBootstrap}</script></body></html>`;
  const dir = makeDist({
    "index.html": html,
    "app.js": "import './assets/chunk.js';",
  });
  assert.deepStrictEqual(
    findCspBootstrapIssues(dir, cspWithPolicy(`script-src ${sha(cspBootstrap)} 'strict-dynamic'`)),
    ["index.html: parser-inserted modulepreload remains"]
  );
});

test("passes built HTML whose inline scripts are all hashed in script-src", () => {
  const body = "window.theme='dark';";
  const dir = makeDist({ "index.html": inlineHtml(body), "tier-list/index.html": inlineHtml(body) });
  assert.deepStrictEqual(findCspHashIssues(dir, cspFirebase(sha(body))), []);
});

test("flags an inline script whose hash is not in script-src, naming the page and hash", () => {
  const dir = makeDist({ "index.html": inlineHtml("window.drift=1;") });
  const expected = `index.html: ${sha("window.drift=1;")} is not in script-src`;
  assert.deepStrictEqual(findCspHashIssues(dir, cspFirebase(sha("window.theme='dark';"))), [expected]);
});

test("flags a hash placed in another directive instead of script-src", () => {
  const body = "window.x=1;";
  const dir = makeDist({ "index.html": inlineHtml(body) });
  const firebase = cspFirebase("");
  firebase.hosting.headers[0].headers[0].value += `; style-src ${sha(body)}`;
  assert.deepStrictEqual(findCspHashIssues(dir, firebase), [
    `index.html: ${sha(body)} is not in script-src`,
  ]);
});

test("flags a missing enforced header", () => {
  const dir = makeDist({ "index.html": inlineHtml("x") });
  assert.deepStrictEqual(findCspHashIssues(dir, cspFirebase(null)), [
    "firebase.json: no Content-Security-Policy header on **",
  ]);
});

test("the shipped firebase.json policy passes a page carrying the template theme script", () => {
  const body = fs.readFileSync(path.join(__dirname, "..", "..", "index.html"), "utf8")
    .match(/<script data-theme-init="true">([\s\S]*?)<\/script>/)[1];
  const dir = makeDist({ "index.html": `<script data-theme-init="true">${body}</script>` });
  const firebase = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "firebase.json"), "utf8"));
  assert.deepStrictEqual(findCspHashIssues(dir, firebase), []);
});

const cspWithPolicy = (value) => ({
  hosting: {
    headers: [{ source: "**", headers: [{ key: "Content-Security-Policy", value }] }],
  },
});

test("uses the first duplicate script-src directive", () => {
  const body = "window.duplicate=1;";
  const dir = makeDist({ "index.html": inlineHtml(body) });
  assert.deepStrictEqual(
    findCspHashIssues(dir, cspWithPolicy(`script-src 'none'; script-src ${sha(body)}`)),
    [`index.html: ${sha(body)} is not in script-src`]
  );
});

test("keeps the first allowed duplicate script-src directive", () => {
  const body = "window.duplicate=1;";
  const dir = makeDist({ "index.html": inlineHtml(body) });
  assert.deepStrictEqual(
    findCspHashIssues(dir, cspWithPolicy(`script-src ${sha(body)}; script-src 'none'`)),
    []
  );
});

test("applies first-wins to mixed-case duplicate script-src names", () => {
  const body = "window.duplicate=1;";
  const dir = makeDist({ "index.html": inlineHtml(body) });
  assert.deepStrictEqual(
    findCspHashIssues(dir, cspWithPolicy(`SCRIPT-SRC 'none'; script-src ${sha(body)}`)),
    [`index.html: ${sha(body)} is not in script-src`]
  );
});

test("keeps a first empty script-src restrictive over a duplicate", () => {
  const body = "window.duplicate=1;";
  const dir = makeDist({ "index.html": inlineHtml(body) });
  assert.deepStrictEqual(
    findCspHashIssues(dir, cspWithPolicy(`script-src; script-src ${sha(body)}`)),
    [`index.html: ${sha(body)} is not in script-src`]
  );
});

test("uses script-src-elem before script-src for inline scripts", () => {
  const body = "window.element=1;";
  const dir = makeDist({ "index.html": inlineHtml(body) });
  assert.deepStrictEqual(
    findCspHashIssues(dir, cspWithPolicy(`script-src ${sha(body)}; script-src-elem 'none'`)),
    [`index.html: ${sha(body)} is not in script-src-elem`]
  );
});

test("allows a hash in script-src-elem over a restrictive script-src", () => {
  const body = "window.element=1;";
  const dir = makeDist({ "index.html": inlineHtml(body) });
  assert.deepStrictEqual(
    findCspHashIssues(dir, cspWithPolicy(`script-src 'none'; script-src-elem ${sha(body)}`)),
    []
  );
});

test("keeps an empty script-src-elem restrictive", () => {
  const body = "window.element=1;";
  const dir = makeDist({ "index.html": inlineHtml(body) });
  assert.deepStrictEqual(
    findCspHashIssues(dir, cspWithPolicy(`script-src ${sha(body)}; script-src-elem`)),
    [`index.html: ${sha(body)} is not in script-src-elem`]
  );
});

test("falls back to default-src when no script directive is present", () => {
  const body = "window.defaulted=1;";
  const dir = makeDist({ "index.html": inlineHtml(body) });
  assert.deepStrictEqual(
    findCspHashIssues(dir, cspWithPolicy(`default-src ${sha(body)}`)),
    []
  );
});

test("names default-src when it does not allow the inline script", () => {
  const body = "window.defaulted=1;";
  const dir = makeDist({ "index.html": inlineHtml(body) });
  assert.deepStrictEqual(
    findCspHashIssues(dir, cspWithPolicy("default-src 'self'")),
    [`index.html: ${sha(body)} is not in default-src`]
  );
});

test("keeps an empty script-src restrictive over default-src", () => {
  const body = "window.defaulted=1;";
  const dir = makeDist({ "index.html": inlineHtml(body) });
  assert.deepStrictEqual(
    findCspHashIssues(dir, cspWithPolicy(`default-src ${sha(body)}; script-src`)),
    [`index.html: ${sha(body)} is not in script-src`]
  );
});
