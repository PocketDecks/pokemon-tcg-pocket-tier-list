// scripts/__tests__/locale-pages.test.js
//
// Walks a built dist and asserts the locale page graph: canonicals, hreflang
// reciprocity, the document language, and that the Japanese pages actually
// carry Japanese prose. Runs against dist/ when it exists, so it is skipped in
// a plain test run rather than failing on an unbuilt tree.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const DIST_DIR = process.env.BUILD_DIR
  ? path.resolve(process.env.BUILD_DIR)
  : path.join(__dirname, "..", "..", "dist");
const SITE_HOST = "pocketdecks.top";

const hasDist = fs.existsSync(path.join(DIST_DIR, "index.html"));
const listHtml = (dir = DIST_DIR) =>
  fs.readdirSync(dir, { recursive: true }).filter((entry) => entry.endsWith(".html"));

const decodeXmlEntities = (value) =>
  value
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

const canonicals = (html) =>
  [...html.matchAll(/<link\b[^>]*\brel=["']canonical["'][^>]*>/gi)].map((m) =>
    decodeXmlEntities(m[0].match(/\bhref=["']([^"']*)["']/i)[1])
  );

const alternates = (html) =>
  [...html.matchAll(/<link\b[^>]*\brel=["']alternate["'][^>]*>/gi)].map((m) => ({
    hreflang: m[0].match(/\bhreflang=["']([^"']*)["']/i)[1],
    href: decodeXmlEntities(m[0].match(/\bhref=["']([^"']*)["']/i)[1]),
  }));

const documentLang = (html) => html.match(/<html\b[^>]*\blang=["']([^"']*)["']/i)?.[1] ?? null;

const visibleText = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const cjkCount = (text) => (text.match(/[\u3040-\u30ff\u4e00-\u9faf]/g) || []).length;

const expectedUrl = (entry) => {
  const dir = path.posix.dirname(entry.split(path.sep).join("/"));
  return dir === "." ? `https://${SITE_HOST}/` : `https://${SITE_HOST}/${dir}/`;
};

test("locale page graph in the built output", { skip: !hasDist && "dist/ is not built" }, async (t) => {
  const entries = listHtml().filter((entry) => !entry.endsWith("404.html") && !entry.endsWith("app-shell.html"));
  const jaEntries = entries.filter((entry) => entry.split(path.sep).join("/").startsWith("ja/"));
  const enEntries = entries.filter((entry) => !entry.split(path.sep).join("/").startsWith("ja/"));

  await t.test("both locales are built", () => {
    assert.ok(enEntries.length > 0, "no English pages");
    assert.ok(jaEntries.length > 0, "no Japanese pages");
    assert.strictEqual(
      jaEntries.length,
      enEntries.length,
      `locale trees differ in size: en=${enEntries.length} ja=${jaEntries.length}`
    );
  });

  await t.test("every page has exactly one self-canonical", () => {
    for (const entry of entries) {
      const html = fs.readFileSync(path.join(DIST_DIR, entry), "utf8");
      const found = canonicals(html);
      assert.strictEqual(found.length, 1, `${entry}: ${found.length} canonicals`);
      assert.strictEqual(found[0], expectedUrl(entry), `${entry}: canonical ${found[0]}`);
    }
  });

  await t.test("every page declares the language of its own directory", () => {
    for (const entry of entries) {
      const html = fs.readFileSync(path.join(DIST_DIR, entry), "utf8");
      const locale = entry.split(path.sep).join("/").startsWith("ja/") ? "ja" : "en";
      assert.strictEqual(documentLang(html), locale, `${entry}: lang=${documentLang(html)}`);
    }
  });

  await t.test("the hreflang set is complete, resolvable and reciprocal", () => {
    const urlToEntry = new Map(entries.map((entry) => [expectedUrl(entry), entry]));

    for (const entry of entries) {
      const html = fs.readFileSync(path.join(DIST_DIR, entry), "utf8");
      const set = alternates(html);
      const langs = set.map((a) => a.hreflang).sort();
      assert.deepStrictEqual(langs, ["en", "ja", "x-default"], `${entry}: ${langs.join(",")}`);

      const self = expectedUrl(entry);
      const own = set.find((a) => a.hreflang === (self.includes("/ja/") ? "ja" : "en"));
      assert.strictEqual(own.href, self, `${entry}: own hreflang points at ${own.href}`);

      const english = set.find((a) => a.hreflang === "en").href;
      assert.strictEqual(
        set.find((a) => a.hreflang === "x-default").href,
        english,
        `${entry}: x-default is not the English URL`
      );

      for (const alternate of set) {
        const counterpart = urlToEntry.get(alternate.href);
        assert.ok(
          counterpart !== undefined,
          `${entry}: ${alternate.hreflang} points at ${alternate.href}, which is not a built page`
        );
        const counterpartHtml = fs.readFileSync(path.join(DIST_DIR, counterpart), "utf8");
        const back = alternates(counterpartHtml).find((a) => a.href === self);
        assert.ok(
          back !== undefined,
          `${entry}: ${alternate.hreflang} -> ${alternate.href} does not link back`
        );
      }
    }
  });

  await t.test("English pages carry substantive visible content", () => {
    for (const entry of enEntries) {
      const text = visibleText(fs.readFileSync(path.join(DIST_DIR, entry), "utf8"));
      assert.ok(text.length > 1000, `${entry}: only ${text.length} visible chars`);
    }
  });

  await t.test("Japanese pages carry Japanese prose, not only a translated title", () => {
    const thin = [];
    for (const entry of jaEntries) {
      const text = visibleText(fs.readFileSync(path.join(DIST_DIR, entry), "utf8"));
      const cjk = cjkCount(text);
      if (cjk < 100) thin.push(`${entry}: ${cjk} CJK chars in ${text.length}`);
    }
    assert.deepStrictEqual(thin, [], `Japanese pages without Japanese prose:\n${thin.join("\n")}`);
  });
});
