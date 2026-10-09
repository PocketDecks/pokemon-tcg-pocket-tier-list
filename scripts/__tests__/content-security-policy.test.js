const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const { createHash } = require("node:crypto");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const {
  inlineScriptHashes,
  parsePolicy,
  reportOnlyPolicy,
} = require("../content-security-policy");

const ROOT = path.join(__dirname, "..", "..");
const firebase = JSON.parse(fs.readFileSync(path.join(ROOT, "firebase.json"), "utf8"));
const headers = firebase.hosting.headers.find((rule) => rule.source === "**").headers;
const policy = parsePolicy(reportOnlyPolicy(firebase));
const scriptSources = policy.get("script-src");

test("ships the enforced frame-ancestors header and a Report-Only policy beside it", () => {
  const enforced = headers.find((header) => header.key === "Content-Security-Policy");
  assert.strictEqual(enforced?.value, "frame-ancestors 'none'");
  assert.ok(reportOnlyPolicy(firebase), "Content-Security-Policy-Report-Only is missing");
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

test("keeps unsafe-eval and unsafe-inline out of script-src", () => {
  assert.ok(!scriptSources.includes("'unsafe-eval'"));
  assert.ok(!scriptSources.includes("'unsafe-inline'"));
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
