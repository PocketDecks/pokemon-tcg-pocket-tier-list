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

const workflowDirectory = path.join(root, ".github", "workflows");

test("third-party actions use lowercase commit SHAs", () => {
  const offenders = fs
    .readdirSync(workflowDirectory)
    .filter((name) => name.endsWith(".yml"))
    .flatMap((name) => {
      const workflow = loadYaml(".github", "workflows", name);
      return Object.values(workflow.jobs ?? {}).flatMap((job) =>
        (job.steps ?? [])
          .filter((step) => {
            const uses = step.uses;
            if (typeof uses !== "string" || uses.startsWith("./")) return false;
            return uses.split("/")[0] !== "actions" && !/@[0-9a-f]{40}$/.test(uses);
          })
          .map((step) => step.uses)
      );
    });
  assert.deepStrictEqual(offenders, [], `Unpinned references: ${offenders.join(", ")}`);
});

test("Dependabot has one weekly grouped GitHub Actions update", () => {
  const dependabot = loadYaml(".github", "dependabot.yml");
  const entries = dependabot.updates.filter(
    (entry) => entry["package-ecosystem"] === "github-actions"
  );
  assert.strictEqual(entries.length, 1);
  const [entry] = entries;
  assert.strictEqual(entry.directory, "/");
  assert.strictEqual(entry.schedule?.interval, "weekly");
  assert.strictEqual(entry["open-pull-requests-limit"], 1);
  assert.ok(Object.keys(entry.groups ?? {}).length > 0);
});

test("the root npm allow list stays limited to card data", () => {
  const dependabot = loadYaml(".github", "dependabot.yml");
  const entry = dependabot.updates.find(
    (update) =>
      update["package-ecosystem"] === "npm" &&
      (update.directories?.includes("/") || update.directory === "/")
  );
  assert.ok(entry);
  assert.deepStrictEqual(entry.allow, [
    { "dependency-name": "pokemon-tcg-pocket-cards" },
  ]);
});

test("non-pushing workflows disable checkout credentials", () => {
  const offenders = fs
    .readdirSync(workflowDirectory)
    .filter((name) => name.endsWith(".yml") && name !== "sync-pairings.yml")
    .flatMap((name) => {
      const workflow = loadYaml(".github", "workflows", name);
      return Object.values(workflow.jobs ?? {}).flatMap((job) =>
        (job.steps ?? [])
          .filter(
            (step) =>
              typeof step.uses === "string" &&
              step.uses.split("@")[0] === "actions/checkout" &&
              step.with?.["persist-credentials"] !== false
          )
          .map((step) => `${name}: ${step.uses}`)
      );
    });
  assert.deepStrictEqual(offenders, [], `Credentials persist in: ${offenders.join(", ")}`);
});
