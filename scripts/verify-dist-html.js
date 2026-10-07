const fs = require("fs");
const path = require("path");

const DIST_DIR = process.env.BUILD_DIR
  ? path.resolve(process.env.BUILD_DIR)
  : path.join(__dirname, "..", "dist");
const SITE_HOST = "pocketdecks.top";
const LOOPBACK = /(https?:)?\/\/(127\.0\.0\.1|localhost)(:\d+)?/g;

const listHtmlFiles = (dir = DIST_DIR) =>
  fs.readdirSync(dir, { recursive: true }).filter((entry) => entry.endsWith(".html"));

const findLoopbackRefs = (dir = DIST_DIR) =>
  fs
    .readdirSync(dir, { recursive: true })
    .filter((entry) => entry.endsWith(".html"))
    .flatMap((entry) => {
      const file = path.join(dir, entry);
      const hits = fs.readFileSync(file, "utf8").match(LOOPBACK) || [];
      return hits.map((hit) => `${entry}: ${hit}`);
    });

const findEmptyStyledTags = (dir = DIST_DIR) =>
  fs
    .readdirSync(dir, { recursive: true })
    .filter((entry) => entry.endsWith(".html"))
    .flatMap((entry) => {
      const file = path.join(dir, entry);
      const html = fs.readFileSync(file, "utf8");
      return [...html.matchAll(/<style\b[^>]*data-styled(?:=["'][^"']*["'])?[^>]*>([\s\S]*?)<\/style>/gi)]
        .filter((match) => match[1].trim() === "")
        .map(() => entry);
    });

const findNonEmptyDeckRoots = (dir = DIST_DIR) => {
  const deckDir = path.join(dir, "deck");
  if (!fs.existsSync(deckDir)) return [];
  return fs
    .readdirSync(deckDir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name === "index.html")
    .map((entry) => {
      const file = path.join(entry.parentPath, entry.name);
      const relativeFile = path.relative(deckDir, file);
      if (relativeFile.split(path.sep).length !== 2) return null;
      const html = fs.readFileSync(file, "utf8");
      const root = html.match(/<div\b[^>]*id=["']root["'][^>]*>([\s\S]*?)<\/div>/i);
      return root && root[1].trim() ? path.relative(dir, file) : null;
    })
    .filter(Boolean);
};

const collectModulepreloads = (html) =>
  [...html.matchAll(/<link\b[^>]*>/gi)]
    .map((match) => match[0])
    .filter((tag) => /rel=["']modulepreload["']/i.test(tag))
    .map((tag) => (tag.match(/href=["']([^"']*)["']/i) || [])[1])
    .filter((href) => href !== undefined);

// Deck detail pages are stamped from the built template without a JS render, so
// they carry the template's preload set verbatim. Fall back to the home page.
const findTemplateModulepreloads = (dir = DIST_DIR) => {
  const deckDir = path.join(dir, "deck");
  if (fs.existsSync(deckDir)) {
    const detail = fs
      .readdirSync(deckDir, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name === "index.html")
      .map((entry) => path.join(entry.parentPath, entry.name))
      .filter((file) => path.relative(deckDir, file).split(path.sep).length === 2)
      .sort();
    if (detail.length > 0) {
      return new Set(collectModulepreloads(fs.readFileSync(detail[0], "utf8")));
    }
  }
  const home = path.join(dir, "index.html");
  if (fs.existsSync(home)) {
    return new Set(collectModulepreloads(fs.readFileSync(home, "utf8")));
  }
  return new Set();
};

const sameSet = (a, b) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

const findModulepreloadDrift = (
  dir = DIST_DIR,
  templateHrefs = findTemplateModulepreloads(dir)
) => {
  const expected = [...templateHrefs].sort();
  return listHtmlFiles(dir).flatMap((entry) => {
    const html = fs.readFileSync(path.join(dir, entry), "utf8");
    const actual = [...new Set(collectModulepreloads(html))].sort();
    return sameSet(actual, expected)
      ? []
      : [`${entry}: ${actual.join(", ")}`];
  });
};

const isExternalHost = (src) => {
  const match = src.match(/^(?:https?:)?\/\/([^/?#]+)/i);
  if (!match) return false;
  const host = match[1].split("@").pop().split(":")[0].toLowerCase();
  return host !== SITE_HOST;
};

const findExternalScripts = (dir = DIST_DIR) =>
  listHtmlFiles(dir).flatMap((entry) => {
    const html = fs.readFileSync(path.join(dir, entry), "utf8");
    return [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']*)["'][^>]*>/gi)]
      .map((match) => match[1])
      .filter(isExternalHost)
      .map((src) => `${entry}: ${src}`);
  });

const main = () => {
  const offenders = findLoopbackRefs();
  if (offenders.length > 0) {
    console.error(
      `Loopback origins found in built HTML:\n${offenders.join("\n")}`
    );
    process.exit(1);
  }
  const emptyStyledTags = findEmptyStyledTags();
  if (emptyStyledTags.length > 0) {
    console.error(
      `Empty styled-components CSS found in built HTML:\n${emptyStyledTags.join("\n")}`
    );
    process.exit(1);
  }
  const nonEmptyDeckRoots = findNonEmptyDeckRoots();
  if (nonEmptyDeckRoots.length > 0) {
    console.error(
      `Non-empty deck roots found in built HTML:\n${nonEmptyDeckRoots.join("\n")}`
    );
    process.exit(1);
  }
  const preloadDrift = findModulepreloadDrift();
  if (preloadDrift.length > 0) {
    console.error(
      `Modulepreload sets drifting from the template:\n${preloadDrift.join("\n")}`
    );
    process.exit(1);
  }
  const externalScripts = findExternalScripts();
  if (externalScripts.length > 0) {
    console.error(
      `Script tags pointing at another host in built HTML:\n${externalScripts.join("\n")}`
    );
    process.exit(1);
  }
  console.log(`No loopback origins in ${DIST_DIR}`);
};

if (require.main === module) main();

module.exports = {
  findEmptyStyledTags,
  findExternalScripts,
  findLoopbackRefs,
  findModulepreloadDrift,
  findNonEmptyDeckRoots,
  findTemplateModulepreloads,
};
