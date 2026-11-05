const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const { createHash } = require("node:crypto");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const {
  inlineScriptHashes,
  parsePolicy,
  enforcedPolicy,
} = require("../content-security-policy");

const ROOT = path.join(__dirname, "..", "..");
const firebase = JSON.parse(fs.readFileSync(path.join(ROOT, "firebase.json"), "utf8"));
const headers = firebase.hosting.headers.find((rule) => rule.source === "**").headers;
const policy = parsePolicy(enforcedPolicy(firebase));
const scriptSources = policy.get("script-src");

const cacheControlFor = (rules, pathname) => {
  const filePath = pathname.replace(/^\/+/, "");
  return rules
    .filter((rule) => {
      if (typeof rule.regex === "string") {
        return new RegExp(rule.regex).test(`/${filePath}`);
      }
      if (typeof rule.source !== "string") return false;
      const negated = rule.source.startsWith("!") && !rule.source.startsWith("!(");
      const source = rule.source.slice(negated ? 1 : 0).replace(/^\/+/, "");
      const matches = path.posix.matchesGlob(filePath, source);
      return negated ? !matches : matches;
    })
    .flatMap((rule) => rule.headers)
    .filter((header) => header.key.toLowerCase() === "cache-control")
    .at(-1)?.value;
};

test("normalises directive names and keeps their first occurrence", () => {
  const parsed = parsePolicy(
    "SCRIPT-SRC 'none' 'sha256-ValueAbc='; script-src 'sha256-second='; DEFAULT-SRC 'Self'"
  );
  assert.deepStrictEqual([...parsed], [
    ["script-src", ["'none'", "'sha256-ValueAbc='"]],
    ["default-src", ["'Self'"]],
  ]);
});

test("ships the enforced Content-Security-Policy header", () => {
  const enforced = headers.find((header) => header.key === "Content-Security-Policy");
  assert.ok(enforced, "Content-Security-Policy header is missing");
  assert.ok(!headers.some((header) => header.key === "Content-Security-Policy-Report-Only"), "Report-Only header must not ship beside the enforced policy");
  assert.deepStrictEqual(policy.get("frame-ancestors"), ["'none'"]);
});

test("restricts every resource type with explicit directives", () => {
  for (const name of [
    "default-src",
    "script-src",
    "style-src",
    "img-src",
    "font-src",
    "connect-src",
    "frame-src",
    "object-src",
    "base-uri",
    "form-action",
  ]) {
    assert.ok(policy.has(name), `${name} is missing`);
  }
  assert.deepStrictEqual(policy.get("default-src"), ["'self'"]);
  assert.deepStrictEqual(policy.get("object-src"), ["'none'"]);
  assert.deepStrictEqual(policy.get("base-uri"), ["'self'"]);
  assert.deepStrictEqual(policy.get("form-action"), ["'self'"]);
});

test("keeps unsafe-inline only in the hash-backed strict compatibility policy", () => {
  assert.ok(!scriptSources.includes("'unsafe-eval'"));
  assert.ok(scriptSources.includes("'unsafe-inline'"));
  assert.ok(scriptSources.includes("'strict-dynamic'"));
  assert.ok(scriptSources.some((source) => /^'sha256-[A-Za-z0-9+/]+=*'$/.test(source)));
});

test("uses a hash-trusted bootstrap and strict-dynamic for the application", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const bootstrap = html.match(/<script\b(?=[^>]*\bid=["']csp-bootstrap-template["'])[^>]*>([\s\S]*?)<\/script>/i);
  assert.ok(bootstrap, "the HTML must carry its application bootstrap template");
  const body = bootstrap[1];
  assert.match(body, /createElement\s*\(\s*["']script["']\s*\)/);
  assert.match(body, /\.type\s*=\s*["']module["']/);
  assert.match(body, /\.src\s*=\s*["']\/app\.js["']/);
  assert.match(body, /document\.head\.append/);
  const [bootstrapHash] = inlineScriptHashes(`<script>${body}</script>`);
  assert.ok(scriptSources.includes(bootstrapHash), `${bootstrapHash} is not in script-src`);
  assert.ok(scriptSources.includes("'strict-dynamic'"));
  assert.equal(cacheControlFor(firebase.hosting.headers, "/app.js"), "no-cache");
  assert.equal(cacheControlFor(firebase.hosting.headers, "/assets/chunk-AbCd1234.js"), "public, max-age=31536000, immutable");
});

test("matches ordered Firebase cache rules with exact, wildcard, brace and extglob sources", () => {
  const cacheRule = (source, value) => ({
    source,
    headers: [{ key: "Cache-Control", value }],
  });
  const rules = [
    cacheRule("**", "global"),
    cacheRule("app.js", "exact"),
    cacheRule("*.js", "wildcard"),
    cacheRule("/{app,main}.js", "brace"),
    cacheRule("+(app|main).js", "extglob"),
    cacheRule("/assets/**", "immutable"),
    cacheRule("/styles/**", "unrelated"),
  ];

  assert.equal(cacheControlFor(rules, "/app.js"), "extglob");
  assert.equal(cacheControlFor(rules, "/other.js"), "wildcard");
  assert.equal(cacheControlFor(rules, "/assets/chunk.js"), "immutable");
  assert.equal(cacheControlFor(rules, "/image.png"), "global");
});

test("matches Firebase negated globs, negative extglobs and regular-expression sources", () => {
  const cacheRule = (source, value) => ({
    source,
    headers: [{ key: "Cache-Control", value }],
  });
  const rules = [
    cacheRule("**", "global"),
    cacheRule("!/@(js|css)/**", "outside js and css"),
    cacheRule("!(main|other).js", "negative extglob"),
    {
      regex: "^/app\\.js$",
      headers: [{ key: "Cache-Control", value: "regex exact" }],
    },
    {
      regex: "^/style\\.css$",
      headers: [{ key: "Cache-Control", value: "regex unrelated" }],
    },
  ];

  assert.equal(cacheControlFor(rules, "/app.js"), "regex exact");
  assert.equal(cacheControlFor(rules, "/main.js"), "outside js and css");
  assert.equal(cacheControlFor(rules, "/js/chunk.js"), "global");
  assert.equal(cacheControlFor(rules, "/site.css"), "outside js and css");
});

test("rejects later unsafe app-entry cache overrides but honours unrelated and restored rules", () => {
  const cacheRule = (source, value, key = "Cache-Control") => ({
    source,
    headers: [{ key, value }],
  });
  const assertAppEntryNoCache = (rules) => assert.equal(
    cacheControlFor(rules, "/app.js"),
    "no-cache"
  );
  const unsafeCache = "public, max-age=3600";

  assert.throws(
    () => assertAppEntryNoCache([...firebase.hosting.headers, cacheRule("/app.js", unsafeCache)]),
    assert.AssertionError
  );
  assert.throws(
    () => assertAppEntryNoCache([...firebase.hosting.headers, cacheRule("*.js", unsafeCache)]),
    assert.AssertionError
  );
  const lowercaseUnsafeRules = [
    ...firebase.hosting.headers,
    cacheRule("/app.js", unsafeCache, "cache-control"),
  ];
  const emptyOverrideRules = [
    ...firebase.hosting.headers,
    cacheRule("/app.js", ""),
  ];
  assert.deepStrictEqual(
    [
      cacheControlFor(lowercaseUnsafeRules, "/app.js"),
      cacheControlFor(emptyOverrideRules, "/app.js"),
    ],
    [unsafeCache, ""]
  );
  assert.throws(() => assertAppEntryNoCache(lowercaseUnsafeRules), assert.AssertionError);
  assert.throws(() => assertAppEntryNoCache(emptyOverrideRules), assert.AssertionError);
  assertAppEntryNoCache([...firebase.hosting.headers, cacheRule("/other.js", unsafeCache)]);
  assertAppEntryNoCache([
    ...firebase.hosting.headers,
    cacheRule("/app.js", unsafeCache),
    cacheRule("app.js", "no-cache"),
  ]);
});

test("does not enforce Trusted Types, which would break the ad and consent scripts", () => {
  assert.ok(!policy.has("require-trusted-types-for"));
});

test("allows the theme-init script of index.html by hash", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const [themeHash] = inlineScriptHashes(
    html.match(/<script data-theme-init="true">[\s\S]*?<\/script>/)[0]
  );
  assert.ok(scriptSources.includes(themeHash), `${themeHash} is not in script-src`);
});

test("allows the consent-pending script generated at build time by hash", async () => {
  const modulePath = pathToFileURL(path.join(ROOT, "src", "consent", "consent-pending.mjs")).href;
  const { buildConsentPendingData, consentPendingScript } = await import(modulePath);
  const script = consentPendingScript(await buildConsentPendingData());
  const [consentHash] = inlineScriptHashes(`<script>${script}</script>`);
  assert.ok(scriptSources.includes(consentHash), `${consentHash} is not in script-src`);
});

test("hashes only executable inline scripts", () => {
  const html = [
    '<script type="application/ld+json">{"@type":"WebSite"}</script>',
    '<script type="module" src="/assets/index.js"></script>',
    "<script>window.a=1</script>",
    '<script type="module">window.b=2</script>',
  ].join("");
  const expected = ["window.a=1", "window.b=2"].map(
    (body) => `'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`
  );
  assert.deepStrictEqual(inlineScriptHashes(html), expected);
});

test("allows the AdSense traffic quality frames and scripts seen in the preview run", () => {
  assert.ok(policy.get("frame-src").includes("https://*.adtrafficquality.google"));
  assert.ok(policy.get("frame-src").includes("https://www.google.com"));
  assert.ok(policy.get("script-src").includes("https://*.adtrafficquality.google"));
  assert.ok(policy.get("connect-src").includes("https://*.adtrafficquality.google"));
});

test("allows the consent and font hosts seen in the live PageSpeed run", () => {
  assert.ok(policy.get("connect-src").includes("https://analytics.google.com"));
  assert.ok(policy.get("script-src").includes("https://fundingchoicesmessages.google.com"));
  assert.ok(policy.get("connect-src").includes("https://fundingchoicesmessages.google.com"));
  assert.ok(policy.get("frame-src").includes("https://fundingchoicesmessages.google.com"));
  assert.ok(policy.get("style-src").includes("https://fonts.googleapis.com"));
  assert.ok(policy.get("font-src").includes("https://fonts.gstatic.com"));
});
