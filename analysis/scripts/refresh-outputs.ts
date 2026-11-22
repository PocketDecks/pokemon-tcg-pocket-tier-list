import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { writeFileAtomic } from "../../scripts/atomic-write.mjs";
import {
  ARTEFACT_BASES,
  DEFAULT_WINDOW,
  TRIMMED_WINDOWS,
  windowArtefactName,
  windowDataFile,
} from "../../src/types/meta-windows";
import { PREMIUM_ARTEFACT_NAMES } from "../src/utils/premium-artefacts";
import { renameWithRetry } from "../src/utils/rename-with-retry";

const PREMIUM_DIR = "analysis/out/premium";
const PREMIUM_PREVIOUS_DIR = "analysis/out/premium-previous";

export const REFRESH_OUTPUT_FILES = [
  "analysis/src/data/limitless-decks.json",
  "analysis/src/__fixtures__/deck-name-golden.json",
  "analysis/src/data/card-printings.json",
  "src/data/premium-deck-slugs.json",
  "src/data/deck-hub-slugs.json",
  "src/app/last-updated.ts",
  "public/data/deck-archive.json",
  "firebase.json",
  "public/data/data-version.json",
  "public/data/historical-trends.json",
  "public/data/card-scores.json",
  ...ARTEFACT_BASES.flatMap((base) => [
    `public/data/${windowDataFile(base, DEFAULT_WINDOW)}`,
    ...TRIMMED_WINDOWS.map((window) => `public/data/${windowArtefactName(base, window)}.json`),
  ]),
  ...PREMIUM_ARTEFACT_NAMES.map((name) => `${PREMIUM_DIR}/${name}.json`),
];
export const REFRESH_OUTPUT_TREES = ["public/data/hubs", "public/og/deck"];

const TIMESTAMP_FILE = "src/app/last-updated.ts";
const SCRATCH_NAME = "refresh-scratch";

const isPremium = (name: string): boolean => name.startsWith(`${PREMIUM_DIR}/`);
// Premium files are ignored by git, so they are compared and moved by hand.
export const TRACKED_OUTPUTS = [
  ...REFRESH_OUTPUT_FILES.filter((name) => !isPremium(name)),
  ...REFRESH_OUTPUT_TREES,
];

const git = (cwd: string, ...args: string[]): string =>
  execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "pipe"] });

const gitDir = (root: string): string => path.resolve(root, git(root, "rev-parse", "--git-dir").trim());

export const scratchPath = (root: string): string => path.join(gitDir(root), SCRATCH_NAME);

const assertMainCheckout = (root: string): void => {
  if (path.basename(gitDir(root)) === SCRATCH_NAME) {
    throw new Error("refresh stopped: run refresh:outputs from the main checkout, not the scratch worktree");
  }
};

type Change = { name: string; removed: boolean };

// Output paths that differ from HEAD in `cwd`, untracked files included.
const changedOutputs = (cwd: string): Change[] =>
  git(cwd, "status", "--porcelain=v1", "-z", "--untracked-files=all", "--", ...TRACKED_OUTPUTS)
    .split("\0")
    .filter(Boolean)
    .map((token) => ({ name: token.slice(3), removed: token.slice(0, 2).includes("D") }));

const assertOutputsClean = (root: string): void => {
  const dirty = changedOutputs(root);
  if (dirty.length) {
    throw new Error(
      `refresh stopped: generated outputs already changed in the working tree: ${dirty.map((c) => c.name).join(", ")}`
    );
  }
};

const link = (target: string, destination: string): void => {
  if (!fs.existsSync(target)) return;
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.symlinkSync(target, destination, "junction");
};

const unlinkLinks = (scratch: string): void => {
  for (const name of ["node_modules", "analysis/node_modules", "analysis/data"]) {
    const full = path.join(scratch, name);
    try {
      if (fs.lstatSync(full).isSymbolicLink()) fs.unlinkSync(full);
    } catch {
      // Not there, nothing to unlink.
    }
  }
};

const discardScratch = (root: string): void => {
  const scratch = scratchPath(root);
  if (!fs.existsSync(scratch)) return;
  unlinkLinks(scratch);
  try {
    git(root, "worktree", "remove", "--force", scratch);
  } catch {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
  git(root, "worktree", "prune");
};

export const discardRefresh = (root: string): void => {
  assertMainCheckout(root);
  discardScratch(root);
};

// Creates the scratch worktree the generators run in and returns its path.
// The directory is claimed with mkdir, which fails when another refresh holds it.
export const beginRefresh = (root: string): string => {
  assertMainCheckout(root);
  const scratch = scratchPath(root);
  assertOutputsClean(root);
  try {
    fs.mkdirSync(scratch);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    throw new Error(
      `refresh stopped: ${scratch} exists, so a refresh is running or was interrupted. ` +
        "If none is running, run `yarn refresh:outputs discard` and start again",
      { cause: error }
    );
  }
  try {
    git(root, "worktree", "add", "--detach", "--force", scratch, "HEAD");
    link(path.join(root, "node_modules"), path.join(scratch, "node_modules"));
    link(path.join(root, "analysis/node_modules"), path.join(scratch, "analysis/node_modules"));
    link(path.join(root, "analysis/data"), path.join(scratch, "analysis/data"));
    for (const name of [".env", PREMIUM_PREVIOUS_DIR]) {
      const source = path.join(root, name);
      if (fs.existsSync(source)) fs.cpSync(source, path.join(scratch, name), { recursive: true });
    }
  } catch (error) {
    discardScratch(root);
    throw error;
  }
  return scratch;
};

const sameBytes = (a: string, b: string): boolean => {
  try {
    return fs.readFileSync(a).equals(fs.readFileSync(b));
  } catch {
    return false;
  }
};

const changedPremium = (root: string, scratch: string): string[] =>
  REFRESH_OUTPUT_FILES.filter(isPremium).filter(
    (name) => fs.existsSync(path.join(scratch, name)) && !sameBytes(path.join(root, name), path.join(scratch, name))
  );

const requireScratch = (root: string): string => {
  const scratch = scratchPath(root);
  if (!fs.existsSync(scratch)) throw new Error("refresh stopped: no scratch worktree; run begin first");
  return scratch;
};

export const classifyRefresh = (root: string): string[] => {
  assertMainCheckout(root);
  const scratch = requireScratch(root);
  return [...changedOutputs(scratch).map((change) => change.name), ...changedPremium(root, scratch)].filter(
    (name) => name !== TIMESTAMP_FILE
  );
};

const replaceDirectory = (source: string, target: string): void => {
  if (!fs.existsSync(source)) return;
  const incoming = `${target}.incoming`;
  const outgoing = `${target}.outgoing`;
  fs.rmSync(incoming, { recursive: true, force: true });
  fs.rmSync(outgoing, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, incoming, { recursive: true });
  if (fs.existsSync(target)) renameWithRetry(target, outgoing);
  renameWithRetry(incoming, target);
  fs.rmSync(outgoing, { recursive: true, force: true });
};

// Moves the finished outputs from the scratch worktree into the checkout,
// stages the tracked ones and removes the scratch worktree.
export const stageRefresh = (root: string): string[] => {
  assertMainCheckout(root);
  const scratch = requireScratch(root);
  assertOutputsClean(root);
  // A commit made in the checkout after begin would be reverted by copying
  // the scratch worktree's older files over it.
  if (git(root, "rev-parse", "HEAD").trim() !== git(scratch, "rev-parse", "HEAD").trim()) {
    throw new Error("refresh stopped: the checkout HEAD moved since begin; run refresh:outputs discard and start again");
  }
  const changes = changedOutputs(scratch);
  for (const { name, removed } of changes) {
    const destination = path.join(root, name);
    if (removed) {
      fs.rmSync(destination, { force: true });
    } else {
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      writeFileAtomic(destination, fs.readFileSync(path.join(scratch, name)));
    }
  }
  replaceDirectory(path.join(scratch, PREMIUM_DIR), path.join(root, PREMIUM_DIR));
  replaceDirectory(path.join(scratch, PREMIUM_PREVIOUS_DIR), path.join(root, PREMIUM_PREVIOUS_DIR));
  const staged = changes.map((change) => change.name);
  if (staged.length) git(root, "add", "--", ...staged);
  discardScratch(root);
  return staged;
};

if (require.main === module) {
  const action = process.argv[2];
  const root = path.resolve(__dirname, "../..");
  if (action === "begin") console.log(beginRefresh(root));
  else if (action === "classify") console.log(classifyRefresh(root).join("\n"));
  else if (action === "stage") console.log(stageRefresh(root).join("\n"));
  else if (action === "discard") discardRefresh(root);
  else if (action === "outputs") console.log(TRACKED_OUTPUTS.join("\n"));
  else throw new Error("usage: refresh:outputs <begin|classify|stage|discard|outputs>");
}
