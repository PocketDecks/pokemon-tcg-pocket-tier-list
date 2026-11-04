const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { renderRobots, buildRobotsOutput, runCheck, ROBOTS_FILE, UPSTREAM_FILE, SOURCE_FILE } =
  require("../generate-robots.mjs");
const { ALLOW_GROUP, NEVER_LISTED } = require("../robots-policy.mjs");

const upstreamNames = Object.keys(JSON.parse(fs.readFileSync(UPSTREAM_FILE, "utf8")));

const parseGroups = (text) => {
  const groups = [];
  const sitemaps = [];
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (field === "sitemap") {
      sitemaps.push(value);
    } else if (field === "user-agent") {
      if (!current || current.rules.length > 0) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value);
    } else if (current) {
      current.rules.push({ field, value });
    }
  }
  return { groups, sitemaps };
};

const FIXTURE = ["GPTBot", "CCBot", "Bytespider", ...ALLOW_GROUP, ...NEVER_LISTED];

test("the block group never holds an allow-group or never-listed agent", () => {
  const { groups } = parseGroups(renderRobots(FIXTURE));
  const blocked = groups
    .filter((group) => group.rules.some((rule) => rule.field === "disallow"))
    .flatMap((group) => group.agents);
  assert.deepStrictEqual(
    blocked.filter((agent) => ALLOW_GROUP.includes(agent) || NEVER_LISTED.includes(agent)),
    []
  );
  assert.deepStrictEqual(blocked.sort(), ["Bytespider", "CCBot", "GPTBot"]);
});

test("every allow-group agent sits under Allow: / and nothing else", () => {
  const { groups } = parseGroups(renderRobots(FIXTURE));
  for (const agent of ALLOW_GROUP) {
    const group = groups.find((candidate) => candidate.agents.includes(agent));
    assert.deepStrictEqual(group?.rules, [{ field: "allow", value: "/" }], agent);
  }
});

test("generation is deterministic whatever order the upstream names arrive in", () => {
  const output = renderRobots(FIXTURE);
  assert.strictEqual(renderRobots(FIXTURE), output);
  assert.strictEqual(renderRobots([...FIXTURE].reverse()), output);
});

test("every allow-group and never-listed name exists in the pinned upstream list", () => {
  for (const agent of [...ALLOW_GROUP, ...NEVER_LISTED]) {
    assert.ok(upstreamNames.includes(agent), `${agent} is not upstream`);
  }
});

test("the pinned source record names the repository, path, commit and fetch date", () => {
  const source = JSON.parse(fs.readFileSync(SOURCE_FILE, "utf8"));
  assert.strictEqual(source.repo, "ai-robots-txt/ai.robots.txt");
  assert.strictEqual(source.path, "robots.json");
  assert.match(source.sha, /^[0-9a-f]{40}$/);
  assert.match(source.fetched, /^\d{4}-\d{2}-\d{2}$/);
});

test("the check passes for a file that matches the generator output", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "robots-check-"));
  const file = path.join(dir, "robots.txt");
  fs.writeFileSync(file, buildRobotsOutput());
  assert.strictEqual(runCheck(file), true);
});

test("the check fails when the robots file is edited by hand", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "robots-check-"));
  const file = path.join(dir, "robots.txt");
  fs.writeFileSync(file, `${buildRobotsOutput()}Disallow: /extra\n`);
  assert.strictEqual(runCheck(file), false);
});

test("the check fails when the robots file is missing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "robots-check-"));
  assert.strictEqual(runCheck(path.join(dir, "robots.txt")), false);
});

test("the committed public/robots.txt equals the generator output", () => {
  assert.strictEqual(fs.readFileSync(ROBOTS_FILE, "utf8"), buildRobotsOutput());
});
