const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { PREMIUM_DATA_FILES, findPremiumDataFiles } = require("../verify-dist-html");

const PUBLIC_DATA = path.join(__dirname, "..", "..", "public", "data");

const makeDist = (files) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dist-"));
  for (const name of files) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), "[]");
  }
  return dir;
};

test("lists the six premium window files", () => {
  assert.deepStrictEqual([...PREMIUM_DATA_FILES].sort(), [
    "best-decks-30d.json",
    "best-decks-all.json",
    "matchup-data-30d.json",
    "matchup-data-all.json",
    "meta-share-30d.json",
    "meta-share-all.json",
  ]);
});

test("public data holds none of the premium window files", () => {
  const present = PREMIUM_DATA_FILES.filter((name) => fs.existsSync(path.join(PUBLIC_DATA, name)));
  assert.deepStrictEqual(present, []);
});

test("public data carries a sixteen character premium version", () => {
  const version = JSON.parse(fs.readFileSync(path.join(PUBLIC_DATA, "data-version.json"), "utf8"));
  assert.match(version.premium, /^[0-9a-f]{16}$/);
});

test("passes a dist whose data folder holds only public files", () => {
  const dir = makeDist(["data/best-decks.json", "data/best-decks-10d.json", "data/data-version.json", "index.html"]);
  assert.deepStrictEqual(findPremiumDataFiles(dir), []);
});

test("rejects a dist containing a premium file", () => {
  const dir = makeDist(["data/best-decks.json", "data/matchup-data-30d.json", "data/meta-share-all.json"]);
  assert.deepStrictEqual(findPremiumDataFiles(dir).sort(), [
    path.join("data", "matchup-data-30d.json"),
    path.join("data", "meta-share-all.json"),
  ]);
});

test("rejects a premium file anywhere under the data folder", () => {
  const dir = makeDist(["data/old/best-decks-all.json"]);
  assert.deepStrictEqual(findPremiumDataFiles(dir), [path.join("data", "old", "best-decks-all.json")]);
});

test("passes a dist with no data folder", () => {
  const dir = makeDist(["index.html"]);
  assert.deepStrictEqual(findPremiumDataFiles(dir), []);
});
