const fs = require("fs");
const path = require("path");

const DIST_DIR = process.env.BUILD_DIR
  ? path.resolve(process.env.BUILD_DIR)
  : path.join(__dirname, "..", "dist");
const LOOPBACK = /(https?:)?\/\/(127\.0\.0\.1|localhost)(:\d+)?/g;

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
  console.log(`No loopback origins in ${DIST_DIR}`);
};

if (require.main === module) main();

module.exports = { findEmptyStyledTags, findLoopbackRefs, findNonEmptyDeckRoots };
