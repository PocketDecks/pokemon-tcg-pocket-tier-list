const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { writeFileAtomic } = require("../atomic-write.mjs");

const makeDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "atomic-write-"));

test("writes the contents to the destination and leaves no temporary file", () => {
  const dir = makeDir();
  const destination = path.join(dir, "out.json");
  writeFileAtomic(destination, "first");
  writeFileAtomic(destination, "second");
  assert.strictEqual(fs.readFileSync(destination, "utf8"), "second");
  assert.deepStrictEqual(fs.readdirSync(dir), ["out.json"]);
});

test("a failed rename throws and removes its temporary file", () => {
  const dir = makeDir();
  const destination = path.join(dir, "out.json");
  fs.mkdirSync(destination);
  assert.throws(() => writeFileAtomic(destination, "payload"));
  assert.deepStrictEqual(fs.readdirSync(dir), ["out.json"]);
});
