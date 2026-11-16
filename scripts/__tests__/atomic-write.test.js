const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { after } = require("node:test");
const { writeFileAtomic } = require("../atomic-write.mjs");

const created = [];
const makeDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atomic-write-"));
  created.push(dir);
  return dir;
};
after(() => {
  for (const dir of created.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

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

test("a partial temporary write removes the file created by the writer", () => {
  const dir = makeDir();
  const destination = path.join(dir, "out.json");
  const write = fs.writeFileSync;
  fs.writeFileSync = (file, contents, ...options) => {
    if (typeof file === "string" && file.endsWith(".tmp")) {
      write(file, "partial");
      throw new Error("disk full");
    }
    return write(file, contents, ...options);
  };
  try {
    assert.throws(() => writeFileAtomic(destination, "payload"), /disk full/);
  } finally {
    fs.writeFileSync = write;
  }
  assert.deepStrictEqual(fs.readdirSync(dir), []);
});

test("keeps the previous destination when the write fails", () => {
  const dir = makeDir();
  const destination = path.join(dir, "out.json");
  writeFileAtomic(destination, "previous");
  const write = fs.writeFileSync;
  fs.writeFileSync = () => {
    throw new Error("disk full");
  };
  try {
    assert.throws(() => writeFileAtomic(destination, "payload"), /disk full/);
  } finally {
    fs.writeFileSync = write;
  }
  assert.strictEqual(fs.readFileSync(destination, "utf8"), "previous");
});
