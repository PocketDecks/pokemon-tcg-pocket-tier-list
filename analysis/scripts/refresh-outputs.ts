import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { renameWithRetry } from "../src/utils/rename-with-retry";

export const REFRESH_OUTPUT_FILES = [
  "analysis/src/data/limitless-decks.json", "analysis/src/__fixtures__/deck-name-golden.json",
  "analysis/src/data/card-printings.json", "src/data/premium-deck-slugs.json",
  "src/data/deck-hub-slugs.json", "src/app/last-updated.ts", "public/data/deck-archive.json",
  "firebase.json", "public/data/data-version.json", "public/data/historical-trends.json",
  "public/data/card-scores.json", "public/data/best-decks.json", "public/data/best-decks-10d.json",
  "public/data/best-decks-20d.json", "public/data/meta-share.json", "public/data/meta-share-10d.json",
  "public/data/meta-share-20d.json", "public/data/matchup-data.json", "public/data/matchup-data-10d.json",
  "public/data/matchup-data-20d.json",
  ...["best-decks-30d", "best-decks-all", "matchup-data-30d", "matchup-data-all", "matchup-data-10d", "matchup-data-20d", "meta-share-30d", "meta-share-all", "meta-share-10d", "meta-share-20d"].map((name) => `analysis/out/premium/${name}.json`),
];
export const REFRESH_OUTPUT_TREES = ["public/data/hubs", "public/og/deck"];
type Journal = { head: string; baseline: Record<string, string>; checkpoint: Record<string, string>; staged?: string[] };
const hash = (value: Buffer): string => createHash("sha256").update(value).digest("hex");
const git = (root: string, ...args: string[]): string => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const journalPath = (root: string): string => path.resolve(root, git(root, "rev-parse", "--git-path", "refresh-outputs.json"));
const safePath = (root: string, name: string): string => {
  const base = fs.realpathSync(root);
  const full = path.resolve(base, name);
  const relative = path.relative(base, full);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(`refresh recovery stopped: output path escapes worktree: ${name}`);
  let current = base;
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    try {
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink()) throw new Error(`refresh recovery stopped: symlink or junction in output path: ${name}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") break;
      throw error;
    }
  }
  return full;
};
const safeFiles = (root: string, directory: string): string[] => {
  const result: string[] = [];
  const visit = (name: string): void => {
    const full = safePath(root, name);
    let stat: fs.Stats;
    try { stat = fs.lstatSync(full); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
    if (stat.isDirectory()) for (const child of fs.readdirSync(full)) visit(`${name}/${child}`);
    else if (stat.isFile()) result.push(name);
  };
  visit(directory);
  return result;
};
const SIDECAR = String.raw`(?:\.\d+\.[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.tmp(?:\.owner)?)?`;
const TREE_FILE_PATTERNS: Record<string, RegExp> = {
  "public/data/hubs": new RegExp(String.raw`^[a-z0-9]+(?:-[a-z0-9]+)*\.json` + SIDECAR + `$`),
  "public/og/deck": new RegExp(String.raw`^[a-z0-9]+(?:-[a-z0-9]+)*(?:&[a-z0-9]+(?:-[a-z0-9]+)*)*\.png` + SIDECAR + `$`),
};
const enumerate = (root: string): string[] => {
  const result = [...REFRESH_OUTPUT_FILES];
  for (const tree of REFRESH_OUTPUT_TREES) {
    const pattern = TREE_FILE_PATTERNS[tree];
    for (const name of safeFiles(root, tree)) {
      const leaf = name.slice(tree.length + 1);
      if (pattern && !pattern.test(leaf)) throw new Error(`refresh stopped: unexpected file in ${tree}: ${leaf}`);
      result.push(name);
    }
  }
  for (const name of result) safePath(root, name);
  return [...new Set(result)].sort();
};
const contents = (root: string): Record<string, string> => Object.fromEntries(enumerate(root).flatMap((name) => {
  const full = safePath(root, name);
  try { return fs.lstatSync(full).isFile() ? [[name, fs.readFileSync(full).toString("base64")]] : []; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
}));
const currentHashes = (root: string): Record<string, string> => Object.fromEntries(Object.entries(contents(root)).map(([name, value]) => [name, hash(Buffer.from(value, "base64"))]));
const treeHash = (root: string, directory: string): string => {
  const entries: [string, string][] = [];
  for (const name of safeFiles(root, directory)) entries.push([name.slice(directory.length + 1), hash(fs.readFileSync(safePath(root, name)))]);
  return hash(Buffer.from(JSON.stringify(entries.sort(([a], [b]) => a.localeCompare(b)))));
};
const baselineTreeHash = (prefix: string, baseline: Record<string, string>): string => {
  const entries = Object.entries(baseline).filter(([name]) => name.startsWith(`${prefix}/`)).map(([name, value]) => [name.slice(prefix.length + 1), hash(Buffer.from(value, "base64"))] as [string, string]).sort(([a], [b]) => a.localeCompare(b));
  return hash(Buffer.from(JSON.stringify(entries)));
};
const stateTreeHash = (prefix: string, state: Record<string, string>): string => {
  const entries = Object.entries(state).filter(([name]) => name.startsWith(`${prefix}/`)).map(([name, value]) => [name.slice(prefix.length + 1), value] as [string, string]).sort(([a], [b]) => a.localeCompare(b));
  return hash(Buffer.from(JSON.stringify(entries)));
};
const outputNames = (root: string): Set<string> => new Set([...REFRESH_OUTPUT_FILES, ...Object.keys(contents(root)), ...(fs.existsSync(journalPath(root)) ? Object.keys(read(root).baseline) : [])]);
const atomicTemporary = (name: string, known: Set<string>): { target: string; temporary: string; pid: number } | undefined => {
  const match = name.match(/^(.*)\.(\d+)\.([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.tmp(?:\.owner)?$/i);
  if (!match) return undefined;
  const target = match[1];
  if (!known.has(target) && !REFRESH_OUTPUT_TREES.some((tree) => target.startsWith(`${tree}/`))) return undefined;
  const temporary = `${target}.${match[2]}.${match[3]}.tmp`;
  return { target, temporary, pid: Number(match[2]) };
};
type StatusEntry = { name: string; status: string; untracked: boolean };
const statusEntries = (root: string): StatusEntry[] => {
  const tokens = execFileSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
  const entries: StatusEntry[] = [];
  let expectSource = false;
  let sourceStatus = "";
  for (const token of tokens) {
    if (expectSource) {
      entries.push({ name: token, status: sourceStatus, untracked: false });
      expectSource = false;
      continue;
    }
    const status = token.slice(0, 2);
    entries.push({ name: token.slice(3), status, untracked: status === "??" });
    if (status.includes("R") || status.includes("C")) {
      expectSource = true;
      sourceStatus = status;
    }
  }
  return entries;
};
const changedPaths = (root: string): string[] => statusEntries(root).map((entry) => entry.name);
const UNRELATED_UNTRACKED_PREFIXES = [".claude/", ".codex/"];
const relevantChanges = (root: string): StatusEntry[] =>
  statusEntries(root).filter((entry) => !(entry.untracked && UNRELATED_UNTRACKED_PREFIXES.some((prefix) => entry.name.startsWith(prefix))));
const plainName = (name: string): string =>
  name.replace("/deck.previous/", "/deck/").replace(/\.(?:tmp\.owner|tmp|bak|created|owner)$/, "");
const verifiedProof = (root: string, name: string): boolean => {
  const proof = safePath(root, `${name}.tmp.owner`);
  if (!fs.existsSync(proof)) return false;
  try {
    const record = JSON.parse(fs.readFileSync(proof, "utf8")) as { version?: number; sha256?: string };
    return record.version === 1 && record.sha256 === hash(fs.readFileSync(safePath(root, `${name}.tmp`)));
  } catch {
    return false;
  }
};
const assertKnownChanges = (root: string): void => {
  const known = outputNames(root);
  const bad = relevantChanges(root).filter((entry) => !known.has(plainName(entry.name)) && !atomicTemporary(entry.name, known));
  if (bad.length) throw new Error(`refresh recovery stopped: unrelated worktree changes: ${bad.map((entry) => entry.name).join(", ")}`);
};
const read = (root: string): Journal => JSON.parse(fs.readFileSync(journalPath(root), "utf8")) as Journal;
const baselineHashes = (baseline: Record<string, string>): Record<string, string> => Object.fromEntries(Object.entries(baseline).map(([name, value]) => [name, hash(Buffer.from(value, "base64"))]));
const write = (root: string, journal: Journal): void => {
  const target = journalPath(root);
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(journal), { flag: "wx" });
  try {
    renameWithRetry(temporary, target);
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
};

export const beginRefresh = (root: string): void => {
  const target = journalPath(root);
  if (fs.existsSync(target)) throw new Error("refresh begin stopped: journal already exists; recover it first");
  const parent = path.dirname(target);
  const prefix = `${path.basename(target)}.`;
  for (const name of fs.readdirSync(parent)) {
    if (name.startsWith(prefix) && name.endsWith(".tmp")) fs.rmSync(path.join(parent, name), { force: true });
  }
  write(root, { head: git(root, "rev-parse", "HEAD"), baseline: contents(root), checkpoint: currentHashes(root) });
};
export const checkpointRefresh = (root: string): void => {
  const journal = read(root);
  journal.checkpoint = currentHashes(root);
  write(root, journal);
};
export const classifyRefresh = (root: string): string[] => {
  assertKnownChanges(root);
  const journal = read(root);
  const now = currentHashes(root);
  const uncheckpointed = [...new Set([...Object.keys(journal.checkpoint), ...Object.keys(now)])].filter((name) => journal.checkpoint[name] !== now[name]);
  if (uncheckpointed.length) throw new Error(`refresh classification stopped: uncheckpointed file changes: ${uncheckpointed.join(", ")}`);
  const baseline = baselineHashes(journal.baseline);
  return [...new Set([...Object.keys(baseline), ...Object.keys(journal.checkpoint)])].filter((name) =>
    baseline[name] !== journal.checkpoint[name] && name !== "src/app/last-updated.ts"
  );
};
export const recoverRefresh = (root: string): void => {
  if (!fs.existsSync(journalPath(root))) {
    const changed = relevantChanges(root);
    if (changed.length) throw new Error(`refresh recovery stopped: worktree changes without a journal: ${changed.map((entry) => entry.name).join(", ")}`);
    return;
  }
  const journal = read(root);
  const head = git(root, "rev-parse", "HEAD");
  if (head !== journal.head) {
    if (git(root, "rev-parse", "HEAD^") !== journal.head || relevantChanges(root).length) throw new Error("refresh recovery stopped: HEAD changed");
    const committed = git(root, "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD").split("\n").filter(Boolean);
    const known = outputNames(root);
    const hashes = currentHashes(root);
    if (!committed.length || committed.some((name) => !known.has(name) || hashes[name] !== journal.checkpoint[name])) throw new Error("refresh recovery stopped: commit does not match the run checkpoint");
    fs.rmSync(journalPath(root), { force: true });
    return;
  }
  assertKnownChanges(root);
  const stagedPaths = execFileSync("git", ["diff", "--cached", "--name-only", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
  if (stagedPaths.length) {
    if (!journal.staged || stagedPaths.length !== journal.staged.length || stagedPaths.some((name) => !journal.staged!.includes(name))) throw new Error("refresh recovery stopped: staged paths do not match the run journal");
    for (const name of stagedPaths) {
      let stagedHash: string | undefined;
      try { stagedHash = hash(execFileSync("git", ["show", `:${name}`], { cwd: root, stdio: ["ignore", "pipe", "ignore"] })); } catch { stagedHash = undefined; }
      if (stagedHash !== journal.checkpoint[name]) throw new Error(`refresh recovery stopped: staged bytes differ from checkpoint ${name}`);
    }
  }
  const deck = path.join(root, "public/og/deck");
  const expectedDeck = baselineTreeHash("public/og/deck", journal.baseline);
  const previousExists = fs.existsSync(safePath(root, "public/og/deck.previous"));
  let ogPlan: "restore" | "discard" | null = null;
  if (previousExists) {
    if (treeHash(root, "public/og/deck.previous") !== expectedDeck) throw new Error("refresh recovery stopped: unverified OG backup directory");
    if (!fs.existsSync(safePath(root, "public/og/deck"))) ogPlan = "restore";
    else if (treeHash(root, "public/og/deck") === stateTreeHash("public/og/deck", journal.checkpoint) || treeHash(root, "public/og/deck") === expectedDeck) ogPlan = "discard";
    else throw new Error("refresh recovery stopped: OG target differs from its checkpoint");
  }
  const parent = path.dirname(deck);
  const orphanStages = fs.existsSync(parent) ? fs.readdirSync(parent).filter((name) => name.startsWith("deck-stage-")) : [];
  if (orphanStages.length) throw new Error(`refresh recovery stopped: unowned OG staging directories: ${orphanStages.join(", ")}`);
  type SidecarPlan = { name: string; restore: boolean; removals: string[] };
  const sidecarPlans: SidecarPlan[] = [];
  for (const name of outputNames(root)) {
    const full = safePath(root, name);
    const temporaryName = `${name}.tmp`;
    const proofName = `${name}.tmp.owner`;
    const backupName = `${name}.bak`;
    const markerName = `${name}.created`;
    const temporary = safePath(root, temporaryName);
    const backup = safePath(root, backupName);
    const marker = safePath(root, markerName);
    const proof = safePath(root, proofName);
    const hasTemporary = fs.existsSync(temporary);
    const hasBackup = fs.existsSync(backup);
    const hasMarker = fs.existsSync(marker);
    if (hasTemporary) {
      if (hasBackup) {
        if (fs.existsSync(full)) throw new Error(`refresh recovery stopped: unexpected target beside backup ${name}`);
        const saved = journal.baseline[name];
        if (saved === undefined || hash(fs.readFileSync(backup)) !== hash(Buffer.from(saved, "base64"))) throw new Error(`refresh recovery stopped: unowned backup ${backup}`);
      } else {
        const saved = journal.baseline[name];
        if (!verifiedProof(root, name)) throw new Error(`refresh recovery stopped: unproven sidecar state ${name}`);
        if (hasMarker !== (saved === undefined)) throw new Error(`refresh recovery stopped: unproven sidecar state ${name}`);
        if (hasMarker && fs.statSync(marker).size !== 0) throw new Error(`refresh recovery stopped: unproven created marker ${marker}`);
        if (saved === undefined && fs.existsSync(full)) throw new Error(`refresh recovery stopped: unexpected target beside temporary write ${name}`);
        if (saved !== undefined && (!fs.existsSync(full) || hash(fs.readFileSync(full)) !== hash(Buffer.from(saved, "base64")))) throw new Error(`refresh recovery stopped: unproven target ${name}`);
      }
      sidecarPlans.push({ name, restore: hasBackup, removals: [temporaryName, proofName, markerName] });
    } else if (hasBackup || hasMarker) {
      const expected = journal.checkpoint[name];
      if (expected === undefined || !fs.existsSync(full) || hash(fs.readFileSync(full)) !== expected) throw new Error(`refresh recovery stopped: unverified completed write ${name}`);
      if (hasBackup) {
        const saved = journal.baseline[name];
        if (saved === undefined || hash(fs.readFileSync(backup)) !== hash(Buffer.from(saved, "base64"))) throw new Error(`refresh recovery stopped: unowned backup ${backup}`);
      }
      if (hasMarker && fs.statSync(marker).size !== 0) throw new Error(`refresh recovery stopped: unproven created marker ${marker}`);
      if (fs.existsSync(proof)) {
        const record = (() => {
          try { return JSON.parse(fs.readFileSync(proof, "utf8")) as { version?: number; sha256?: string }; }
          catch { return undefined; }
        })();
        if (!record || record.version !== 1 || typeof record.sha256 !== "string" || record.sha256 !== hash(fs.readFileSync(full))) {
          throw new Error(`refresh recovery stopped: unproven writer proof ${proof}`);
        }
      }
      sidecarPlans.push({ name, restore: false, removals: [backupName, proofName, markerName] });
    }
  }
  const atomicTemps = new Map<string, { target: string; pid: number }>();
  const known = outputNames(root);
  for (const name of changedPaths(root)) {
    const parsed = atomicTemporary(name, known);
    if (parsed) atomicTemps.set(parsed.temporary, { target: parsed.target, pid: parsed.pid });
  }
  const abandoned: string[] = [];
  const orphanProofs: string[] = [];
  for (const [name, parsed] of atomicTemps) {
    const temporary = safePath(root, name);
    const owner = safePath(root, `${name}.owner`);
    const hasTemporary = fs.existsSync(temporary);
    if (!fs.existsSync(owner)) throw new Error(`refresh recovery stopped: unproven atomic temporary ${name}`);
    const proof = (() => {
      try { return JSON.parse(fs.readFileSync(owner, "utf8")) as { version?: number; pid?: number; target?: string; temporary?: string; sha256?: string }; }
      catch { throw new Error(`refresh recovery stopped: invalid atomic temporary proof ${name}`); }
    })();
    if (proof.version !== 1 || proof.pid !== parsed.pid || proof.target !== safePath(root, parsed.target) || proof.temporary !== path.basename(name) || !/^[0-9a-f]{64}$/.test(proof.sha256 ?? "") || (hasTemporary && hash(fs.readFileSync(temporary)) !== proof.sha256)) {
      throw new Error(`refresh recovery stopped: invalid atomic temporary proof ${name}`);
    }
    try {
      process.kill(parsed.pid, 0);
      throw new Error(`refresh recovery stopped: atomic writer is still active for ${name}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      (hasTemporary ? abandoned : orphanProofs).push(name);
    }
  }
  const projected = currentHashes(root);
  if (ogPlan === "restore") {
    for (const name of safeFiles(root, "public/og/deck.previous")) {
      const leaf = name.slice("public/og/deck.previous".length + 1);
      projected[`public/og/deck/${leaf}`] = hash(fs.readFileSync(safePath(root, name)));
    }
  }
  for (const plan of sidecarPlans) {
    for (const removal of plan.removals) delete projected[removal];
    if (plan.restore) {
      const saved = journal.baseline[plan.name];
      if (saved !== undefined) projected[plan.name] = hash(Buffer.from(saved, "base64"));
    }
  }
  for (const name of [...abandoned, ...orphanProofs]) {
    delete projected[name];
    delete projected[`${name}.owner`];
  }
  const names = new Set([...Object.keys(journal.baseline), ...Object.keys(projected), ...Object.keys(journal.checkpoint)]);
  const unexpected = [...names].filter((name) => projected[name] !== journal.checkpoint[name]);
  if (unexpected.length) throw new Error(`refresh recovery stopped: unrecorded file changes: ${unexpected.join(", ")}`);

  if (stagedPaths.length) execFileSync("git", ["restore", "--staged", "--", ...stagedPaths], { cwd: root });
  if (ogPlan === "restore") fs.renameSync(safePath(root, "public/og/deck.previous"), safePath(root, "public/og/deck"));
  else if (ogPlan === "discard") fs.rmSync(safePath(root, "public/og/deck.previous"), { recursive: true, force: true });
  for (const plan of sidecarPlans) {
    if (plan.restore) fs.renameSync(safePath(root, `${plan.name}.bak`), safePath(root, plan.name));
    for (const removal of plan.removals) fs.rmSync(safePath(root, removal), { force: true });
  }
  for (const name of abandoned) {
    fs.rmSync(safePath(root, name), { force: true });
    fs.rmSync(safePath(root, `${name}.owner`), { force: true });
  }
  for (const name of orphanProofs) fs.rmSync(safePath(root, `${name}.owner`), { force: true });
  for (const name of names) {
    const saved = journal.baseline[name];
    const full = safePath(root, name);
    if (saved === undefined) fs.rmSync(safePath(root, name), { force: true });
    else { fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(safePath(root, name), Buffer.from(saved, "base64")); }
  }
  fs.rmSync(journalPath(root), { force: true });
};
export const stageRefresh = (root: string): string[] => {
  assertKnownChanges(root);
  const journal = read(root);
  const now = currentHashes(root);
  const baseline = baselineHashes(journal.baseline);
  const changed = [...new Set([...Object.keys(baseline), ...Object.keys(now)])].filter((name) => baseline[name] !== now[name]);
  const unexpected = changed.filter((name) => now[name] !== journal.checkpoint[name]);
  if (unexpected.length) throw new Error(`refresh staging stopped: unrecorded file changes: ${unexpected.join(", ")}`);
  const staged = changed.filter((name) => !name.startsWith("analysis/out/premium/"));
  journal.staged = staged;
  write(root, journal);
  if (staged.length) execFileSync("git", ["add", "--", ...staged], { cwd: root });
  return staged;
};
export const finishRefresh = (root: string): void => { fs.rmSync(journalPath(root), { force: true }); };

if (process.argv[1]?.replace(/\\/g, "/").endsWith("/refresh-outputs.ts")) {
  const action = process.argv[2];
  const root = path.resolve(__dirname, "../..");
  if (action === "begin") beginRefresh(root);
  else if (action === "checkpoint") checkpointRefresh(root);
  else if (action === "recover") recoverRefresh(root);
  else if (action === "classify") console.log(classifyRefresh(root).join("\n"));
  else if (action === "stage") console.log(stageRefresh(root).join("\n"));
  else if (action === "finish") finishRefresh(root);
  else throw new Error("usage: refresh:outputs <begin|checkpoint|recover|classify|stage|finish>");
}
