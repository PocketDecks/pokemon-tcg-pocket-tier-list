const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..", "..");
const sourceRoot = path.join(root, "src");

const sourceFiles = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") return [];
      return sourceFiles(target);
    }
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name) ? [target] : [];
  });

test("source code imports only the lite Firestore entry", () => {
  const offenders = [];
  for (const file of sourceFiles(sourceRoot)) {
    const text = fs.readFileSync(file, "utf8");
    const matches = [...text.matchAll(/firebase\/firestore(?=['"])/g)];
    if (matches.length > 0) {
      offenders.push(path.relative(root, file));
    }
  }
  assert.deepStrictEqual(offenders, []);
});
