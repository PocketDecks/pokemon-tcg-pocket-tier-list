import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  REFRESH_WINDOWS,
  validateRefresh,
} from "../src/utils/validate-refresh";

const args = process.argv.slice(2);
const flag = (name: string): string | null => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : null;
};

const repoRoot = path.resolve(__dirname, "../..");
const dataDir = flag("--data") ?? path.join(repoRoot, "public/data");
const imagesDir = flag("--images") ?? path.join(repoRoot, "public/og/deck");

const readPrevious = (): string | null => {
  const explicit = flag("--previous");
  if (explicit) return explicit;
  if (args.includes("--no-previous")) return null;

  const ref = flag("--previous-ref") ?? "origin/main";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "refresh-previous-"));
  for (const window of REFRESH_WINDOWS) {
    const file = `public/data/best-decks-${window}.json`;
    let contents: string;
    try {
      contents = execFileSync("git", ["show", `${ref}:${file}`], {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      throw new Error(
        `cannot read ${ref}:${file}; fetch ${ref} or pass --previous <dir> or --no-previous`
      );
    }
    fs.writeFileSync(path.join(dir, `best-decks-${window}.json`), contents);
  }
  return dir;
};

let previousDir: string | null;
try {
  previousDir = readPrevious();
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}

const report = validateRefresh(dataDir, imagesDir, previousDir);

for (const row of report.windows) {
  const previous = row.previous === null ? "no previous" : `previous ${row.previous}`;
  console.log(
    `${row.window}: ${row.archetypes} archetypes, floor ${row.floor}, ${previous}`
  );
}
console.log(
  `union: ${report.union} deck names, ${report.images} OG images, ` +
    `${report.missingImages.length} missing, ${report.orphanImages.length} orphan`
);
if (previousDir === null) {
  console.log("previous snapshot not compared; ratio floors skipped");
}

if (report.failures.length) {
  for (const failure of report.failures) console.error(failure);
  process.exit(1);
}
