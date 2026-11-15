const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { makeDist } = require("./verify-dist-html-fixtures");

const SCRIPT = path.join(__dirname, "..", "verify-dist-html.js");

const runMain = (files) => {
  const dir = makeDist({ "data/best-decks.json": "[]", "data/deck-archive.json": "[]", ...files });
  return spawnSync(process.execPath, [SCRIPT], {
    env: { ...process.env, BUILD_DIR: dir },
    encoding: "utf8",
  });
};

test("main prints every failing group before exiting with code 1", () => {
  const result = runMain({
    "index.html": "<html><head><title>a</title><title>b</title></head><body>http://localhost:3000</body></html>",
    "expansion-list/index.html": "<html><head><title>t</title></head></html>",
    "ja/expansion-list/index.html": "<html><head><title>t</title></head></html>",
  });
  assert.strictEqual(result.status, 1);
  assert.match(result.stderr, /Loopback origins found in built HTML:\nindex\.html: http:\/\/localhost:3000/);
  assert.match(result.stderr, /Built pages without exactly one title:\nindex\.html: expected 1 title, found 2/);
  assert.match(result.stderr, /404 and app-shell pages must be noindex without a canonical:\n404\.html: missing/);
  const order = [
    "Loopback origins found in built HTML:",
    "Built pages without exactly one title:",
    "404 and app-shell pages must be noindex without a canonical:",
  ].map((heading) => result.stderr.indexOf(heading));
  assert.deepStrictEqual(order, [...order].sort((a, b) => a - b));
  assert.strictEqual(result.stdout, "");
});
