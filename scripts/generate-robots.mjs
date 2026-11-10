import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileAtomic } from "./atomic-write.mjs";
import { isMainModule } from "./is-main-module.mjs";
import { ALLOW_GROUP, NEVER_LISTED } from "./robots-policy.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const ROBOTS_FILE = path.join(ROOT, "public", "robots.txt");
export const UPSTREAM_FILE = path.join(ROOT, "scripts", "data", "robots-upstream.json");
export const SOURCE_FILE = path.join(ROOT, "scripts", "data", "robots-upstream.source.json");
const HEADER_FILE = path.join(ROOT, "scripts", "data", "robots-header.txt");
const SITEMAP = "https://pocketdecks.top/sitemap.xml";

const compareAgents = (a, b) => {
  const lowerA = a.toLowerCase();
  const lowerB = b.toLowerCase();
  if (lowerA !== lowerB) return lowerA < lowerB ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
};

const userAgentLines = (agents) => agents.map((agent) => `User-agent: ${agent}`);

export const renderRobots = (
  upstreamNames,
  { allow = ALLOW_GROUP, neverListed = NEVER_LISTED } = {}
) => {
  const header = fs.readFileSync(HEADER_FILE, "utf8").replace(/\n+$/, "");
  const excluded = new Set([...allow, ...neverListed]);
  const blocked = upstreamNames.filter((agent) => !excluded.has(agent)).sort(compareAgents);
  const allowed = [...allow].sort(compareAgents);
  const lines = [
    header,
    ...userAgentLines(blocked),
    "Disallow: /",
    "",
    ...userAgentLines(allowed),
    "Allow: /",
    "",
    "User-agent: *",
    "Allow: /",
    "",
    `Sitemap: ${SITEMAP}`,
  ];
  return `${lines.join("\n")}\n`;
};

export const buildRobotsOutput = () =>
  renderRobots(Object.keys(JSON.parse(fs.readFileSync(UPSTREAM_FILE, "utf8"))));

export const runCheck = (file = ROBOTS_FILE) =>
  fs.existsSync(file) && fs.readFileSync(file, "utf8") === buildRobotsOutput();

const main = () => {
  if (process.argv.includes("--check")) {
    if (!runCheck(ROBOTS_FILE)) {
      console.error(`${ROBOTS_FILE} is out of date; run node scripts/generate-robots.mjs`);
      process.exit(1);
    }
    return;
  }
  writeFileAtomic(ROBOTS_FILE, buildRobotsOutput());
  console.log(`Wrote ${ROBOTS_FILE}`);
};

if (isMainModule(import.meta.url)) main();
