const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const yaml = require("js-yaml");

const root = path.resolve(__dirname, "../..");

const loadYaml = (...segments) =>
  yaml.load(fs.readFileSync(path.join(root, ...segments), "utf8"));

test("the merge workflow limits live deploys to one active run", () => {
  assert.deepStrictEqual(
    loadYaml(".github", "workflows", "firebase-hosting-merge.yml").concurrency,
    {
      group: "hosting-live",
      "cancel-in-progress": false,
    }
  );
});
