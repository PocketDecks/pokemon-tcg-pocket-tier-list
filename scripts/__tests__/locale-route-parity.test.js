const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { LOCALE_PREFIXES } = require("../locale-route.mjs");

const DIST_DIR = process.env.BUILD_DIR
  ? path.resolve(process.env.BUILD_DIR)
  : path.join(__dirname, "..", "..", "dist");

const hasDist = fs.existsSync(path.join(DIST_DIR, "index.html"));

const pageEntries = (dir = DIST_DIR) =>
  fs
    .readdirSync(dir, { recursive: true })
    .filter((entry) => entry.endsWith("index.html"))
    .map((entry) => entry.split(path.sep).join("/"))
    .sort();

// Parity is read off the built output, not the route table's source text: a
// route added to one locale's tree only shows up here as an unmatched page.
test(
  "every locale serves the same pages as the default locale",
  { skip: !hasDist && "dist/ is not built" },
  () => {
    const entries = new Set(pageEntries());
    const prefixed = Object.values(LOCALE_PREFIXES).filter((prefix) => prefix !== "");
    const englishPages = [...entries].filter(
      (entry) => !prefixed.some((prefix) => entry.startsWith(`${prefix.slice(1)}/`))
    );

    assert.ok(englishPages.length > 0, "no default-locale pages built");

    for (const prefix of prefixed) {
      const localeDir = prefix.slice(1);
      const missing = englishPages.filter((entry) => !entries.has(`${localeDir}/${entry}`));
      assert.deepStrictEqual(missing, [], `${prefix} has no page for: ${missing.join(", ")}`);

      const localePages = [...entries].filter((entry) => entry.startsWith(`${localeDir}/`));
      const orphaned = localePages.filter(
        (entry) => !entries.has(entry.slice(localeDir.length + 1))
      );
      assert.deepStrictEqual(
        orphaned,
        [],
        `${prefix} has pages with no default-locale counterpart: ${orphaned.join(", ")}`
      );
    }
  }
);
