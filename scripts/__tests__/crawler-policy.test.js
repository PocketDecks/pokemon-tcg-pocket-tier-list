const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const SITE = "https://pocketdecks.top";
const SECURITY_POLICY_URL =
  "https://github.com/PocketDecks/pokemon-tcg-pocket-tier-list/blob/main/SECURITY.md";
const AI_SEARCH_BOTS = [
  "OAI-SearchBot",
  "ChatGPT-User",
  "PerplexityBot",
  "Perplexity-User",
  "Claude-SearchBot",
  "Claude-User",
];
const TRAINING_CRAWLERS = [
  "GPTBot",
  "ClaudeBot",
  "CCBot",
  "Google-Extended",
  "Bytespider",
  "meta-externalagent",
];

const read = (...segments) => fs.readFileSync(path.join(...segments), "utf8");

const parseRobots = (text) => {
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

const robots = parseRobots(read(PUBLIC_DIR, "robots.txt"));
const groupFor = (agent) => robots.groups.find((group) => group.agents.includes(agent));

test("robots.txt gives the AI search and user-triggered bots their own allow group", () => {
  const group = robots.groups.find((candidate) =>
    AI_SEARCH_BOTS.every((bot) => candidate.agents.includes(bot))
  );
  assert.ok(group, "no group holds the AI search bots");
  assert.deepStrictEqual([...group.agents].sort(), [...AI_SEARCH_BOTS].sort());
  assert.deepStrictEqual(group.rules, [{ field: "allow", value: "/" }]);
});

test("robots.txt keeps every training crawler disallowed", () => {
  for (const bot of TRAINING_CRAWLERS) {
    assert.deepStrictEqual(groupFor(bot)?.rules, [{ field: "disallow", value: "/" }], bot);
  }
});

test("robots.txt keeps the wildcard allowance and the sitemap", () => {
  assert.deepStrictEqual(groupFor("*")?.rules, [{ field: "allow", value: "/" }]);
  assert.deepStrictEqual(robots.sitemaps, [`${SITE}/sitemap.xml`]);
});

test("robots.txt keeps the upstream MIT notice", () => {
  const text = read(PUBLIC_DIR, "robots.txt");
  assert.ok(text.startsWith("# https://raw.githubusercontent.com/ai-robots-txt/ai.robots.txt"));
  assert.match(text, /MIT License/);
});

test("llms.txt opens with an H1 site name and a one-paragraph summary", () => {
  const [heading, blank, summary] = read(PUBLIC_DIR, "llms.txt").split("\n");
  assert.strictEqual(heading, "# Top Pocket Decks");
  assert.strictEqual(blank, "");
  assert.match(summary, /^> .*Limitless/);
  assert.match(summary, /refreshed four times a week as new results come in\.$/);
  const blocks = read(PUBLIC_DIR, "llms.txt").split(/^## /m)[0].trim().split(/\n\s*\n/);
  assert.strictEqual(blocks.length, 2);
});

test("llms.txt links the public sections and the sitemap", () => {
  const links = [...read(PUBLIC_DIR, "llms.txt").matchAll(/\]\((https:\/\/pocketdecks\.top[^)\s]*)\)/g)].map(
    (match) => match[1]
  );
  assert.deepStrictEqual(links, [
    `${SITE}/tier-list/`,
    `${SITE}/cards-list/`,
    `${SITE}/statistics/`,
    `${SITE}/expansion-list/`,
    `${SITE}/about/`,
    `${SITE}/sitemap.xml`,
  ]);
});

test("llms.txt closes with the use and security policy", () => {
  const text = read(PUBLIC_DIR, "llms.txt");
  const headings = text.match(/^## .+$/gm);
  assert.strictEqual(headings.at(-1), "## Use and security policy");
  const policy = text.slice(text.lastIndexOf("## Use and security policy"));
  assert.match(policy, /fetched to answer user questions/);
  assert.match(policy, /attribution/);
  assert.match(policy, /vulnerability scanning/);
  assert.match(policy, /exploitation/);
  assert.match(policy, /credential testing/);
  assert.match(policy, /unauthorised access/);
  assert.match(policy, /Computer Misuse Act 1990/);
  assert.ok(policy.includes(`[SECURITY.md](${SECURITY_POLICY_URL})`));
});

const readSecurityFields = () =>
  Object.fromEntries(
    read(PUBLIC_DIR, ".well-known", "security.txt")
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separator = line.indexOf(":");
        return [line.slice(0, separator), line.slice(separator + 1).trim()];
      })
  );
const securityAddress = read(ROOT, "SECURITY.md").match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/)[0];

test("security.txt names the reporting address from SECURITY.md", () => {
  assert.strictEqual(readSecurityFields().Contact, `mailto:${securityAddress}`);
});

test("security.txt points Policy at SECURITY.md on GitHub", () => {
  assert.strictEqual(readSecurityFields().Policy, SECURITY_POLICY_URL);
});

test("security.txt declares English as the preferred language", () => {
  assert.strictEqual(readSecurityFields()["Preferred-Languages"], "en");
});

test("security.txt carries an ISO 8601 UTC expiry that is still in the future", () => {
  const expires = readSecurityFields().Expires;
  assert.match(expires, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.ok(Date.parse(expires) > Date.now(), `${expires} has already passed`);
});
