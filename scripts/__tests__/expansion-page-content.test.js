const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const DIST_DIR = process.env.BUILD_DIR
  ? path.resolve(process.env.BUILD_DIR)
  : path.join(__dirname, "..", "..", "dist");
const hasDist = fs.existsSync(path.join(DIST_DIR, "index.html"));

const expansionPages = () =>
  ["", "ja"].flatMap((prefix) => {
    const root = path.join(DIST_DIR, prefix, "expansion-list");
    if (!fs.existsSync(root)) return [];
    return fs
      .readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(prefix, "expansion-list", entry.name, "index.html"));
  });

const robotsOf = (html) => html.match(/<meta name="robots" content="([^"]*)"/)?.[1] ?? null;

test("every indexed expansion page renders at least one card and one deck", { skip: !hasDist && "dist/ is not built" }, () => {
  const indexed = expansionPages().filter((entry) => (robotsOf(fs.readFileSync(path.join(DIST_DIR, entry), "utf8")) ?? "").startsWith("index"));
  assert.ok(indexed.length > 0, "no indexed expansion pages");
  for (const entry of indexed) {
    const html = fs.readFileSync(path.join(DIST_DIR, entry), "utf8");
    const cards = (html.match(/\/thumbs\/v3\/cards\//g) ?? []).length;
    const decks = (html.match(/<a [^>]*href="(?:\/ja)?\/deck\//g) ?? []).length;
    assert.ok(cards > 0, `${entry}: no card thumbnails rendered`);
    assert.ok(decks > 0, `${entry}: no deck links rendered`);
  }
});
