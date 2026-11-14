import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  ATOMIC_SUFFIX_SOURCE,
  atomicProofIssue,
  atomicProofName,
  git,
  parseAtomicTemporary,
  proofCoversTarget,
  proofCoversTemporary,
  proofIsWellFormed,
  readProof,
  refreshJournalPath as journalPath,
  SIDECAR_SUFFIX,
  sha256 as hash,
  sidecarNames,
} from "../../scripts/refresh-sidecars.mjs";
import { PREMIUM_ARTEFACT_NAMES } from "../src/utils/premium-artefacts";
import { renameWithRetry } from "../src/utils/rename-with-retry";

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
  "public/data/best-decks.json",
  "public/data/best-decks-10d.json",
  "public/data/best-decks-20d.json",
  "public/data/meta-share.json",
  "public/data/meta-share-10d.json",
  "public/data/meta-share-20d.json",
  "public/data/matchup-data.json",
  "public/data/matchup-data-10d.json",
  "public/data/matchup-data-20d.json",
  ...PREMIUM_ARTEFACT_NAMES.map((name) => `analysis/out/premium/${name}.json`),
];
export const REFRESH_OUTPUT_TREES = ["public/data/hubs", "public/og/deck"];

const OG_DECK = "public/og/deck";
const OG_DECK_PREVIOUS = "public/og/deck.previous";

type Journal = {
  head: string;
  baseline: Record<string, string>;
  checkpoint: Record<string, string>;
  staged?: string[];
};
type Hashes = Record<string, string>;

const stopped = (message: string): Error => new Error(`refresh recovery stopped: ${message}`);
const errorCode = (error: unknown): string | undefined => (error as NodeJS.ErrnoException).code;
const savedHash = (saved: string): string => hash(Buffer.from(saved, "base64"));

const safePath = (root: string, name: string): string => {
  const base = fs.realpathSync(root);
  const full = path.resolve(base, name);
  const relative = path.relative(base, full);
  if (
    !relative ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw stopped(`output path escapes worktree: ${name}`);
  }
  let current = base;
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) {
        throw stopped(`symlink or junction in output path: ${name}`);
      }
    } catch (error) {
      if (errorCode(error) === "ENOENT") break;
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
    try {
      stat = fs.lstatSync(full);
    } catch (error) {
      if (errorCode(error) === "ENOENT") return;
      throw error;
    }
    if (stat.isDirectory()) {
      for (const child of fs.readdirSync(full)) visit(`${name}/${child}`);
    } else if (stat.isFile()) {
      result.push(name);
    }
  };
  visit(directory);
  return result;
};

const TREE_FILE_PATTERNS: Record<string, RegExp> = {
  "public/data/hubs": new RegExp(
    String.raw`^[a-z0-9]+(?:-[a-z0-9]+)*\.json` + ATOMIC_SUFFIX_SOURCE + `$`
  ),
  "public/og/deck": new RegExp(
    String.raw`^[a-z0-9]+(?:-[a-z0-9]+)*(?:&[a-z0-9]+(?:-[a-z0-9]+)*)*\.png` +
      ATOMIC_SUFFIX_SOURCE +
      `$`
  ),
};

const enumerate = (root: string): string[] => {
  const result = [...REFRESH_OUTPUT_FILES];
  for (const tree of REFRESH_OUTPUT_TREES) {
    const pattern = TREE_FILE_PATTERNS[tree];
    for (const name of safeFiles(root, tree)) {
      const leaf = name.slice(tree.length + 1);
      if (pattern && !pattern.test(leaf)) {
        throw new Error(`refresh stopped: unexpected file in ${tree}: ${leaf}`);
      }
      result.push(name);
    }
  }
  for (const name of result) safePath(root, name);
  return [...new Set(result)].sort();
};

const contents = (root: string): Record<string, string> =>
  Object.fromEntries(
    enumerate(root).flatMap((name) => {
      const full = safePath(root, name);
      try {
        return fs.lstatSync(full).isFile() ? [[name, fs.readFileSync(full).toString("base64")]] : [];
      } catch (error) {
        if (errorCode(error) === "ENOENT") return [];
        throw error;
      }
    })
  );

const currentHashes = (root: string): Hashes =>
  Object.fromEntries(
    Object.entries(contents(root))
      .filter(([name]) => !SIDECAR_SUFFIX.test(name))
      .map(([name, value]) => [name, savedHash(value)])
  );

const byLeaf = ([a]: [string, string], [b]: [string, string]): number => a.localeCompare(b);
const digestEntries = (entries: [string, string][]): string =>
  hash(Buffer.from(JSON.stringify(entries.sort(byLeaf))));

const treeHash = (root: string, directory: string): string =>
  digestEntries(
    safeFiles(root, directory).map(
      (name): [string, string] => [
        name.slice(directory.length + 1),
        hash(fs.readFileSync(safePath(root, name))),
      ]
    )
  );

const entriesUnder = (
  prefix: string,
  record: Record<string, string>,
  valueOf: (value: string) => string
): [string, string][] =>
  Object.entries(record)
    .filter(([name]) => name.startsWith(`${prefix}/`))
    .map(([name, value]): [string, string] => [name.slice(prefix.length + 1), valueOf(value)]);

const baselineTreeHash = (prefix: string, baseline: Record<string, string>): string =>
  digestEntries(entriesUnder(prefix, baseline, savedHash));

const stateTreeHash = (prefix: string, state: Hashes): string =>
  digestEntries(entriesUnder(prefix, state, (value) => value));

const outputNames = (root: string): Set<string> =>
  new Set([
    ...REFRESH_OUTPUT_FILES,
    ...Object.keys(contents(root)).filter((name) => !SIDECAR_SUFFIX.test(name)),
    ...(fs.existsSync(journalPath(root)) ? Object.keys(read(root).baseline) : []),
  ]);

const atomicTemporary = (
  name: string,
  known: Set<string>
): { target: string; temporary: string; pid: number } | undefined => {
  const parsed = parseAtomicTemporary(name);
  if (!parsed) return undefined;
  const inTree = REFRESH_OUTPUT_TREES.some((tree) => parsed.target.startsWith(`${tree}/`));
  return known.has(parsed.target) || inTree ? parsed : undefined;
};

type StatusEntry = { name: string; status: string; untracked: boolean };
const statusEntries = (root: string): StatusEntry[] => {
  const tokens = execFileSync(
    "git",
    ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    { cwd: root, encoding: "utf8" }
  )
    .split("\0")
    .filter(Boolean);
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
const plainName = (name: string): string =>
  name.replace("/deck.previous/", "/deck/").replace(SIDECAR_SUFFIX, "");

const provesTemporary = (root: string, name: string): boolean => {
  const names = sidecarNames(name);
  const record = readProof(safePath(root, names.proof));
  if (!record) return false;
  try {
    return proofCoversTemporary(record, fs.readFileSync(safePath(root, names.temporary)));
  } catch {
    return false;
  }
};

const provesTarget = (root: string, name: string): boolean => {
  const record = readProof(safePath(root, sidecarNames(name).proof));
  if (!record) return false;
  try {
    return proofCoversTarget(record, fs.readFileSync(safePath(root, name)));
  } catch {
    return false;
  }
};

const assertKnownChanges = (root: string): void => {
  const known = outputNames(root);
  const bad = statusEntries(root).filter(
    (entry) => !known.has(plainName(entry.name)) && !atomicTemporary(entry.name, known)
  );
  if (bad.length) {
    throw stopped(`unrelated worktree changes: ${bad.map((entry) => entry.name).join(", ")}`);
  }
};

const read = (root: string): Journal =>
  JSON.parse(fs.readFileSync(journalPath(root), "utf8")) as Journal;

const baselineHashes = (baseline: Record<string, string>): Hashes =>
  Object.fromEntries(Object.entries(baseline).map(([name, value]) => [name, savedHash(value)]));

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
  if (fs.existsSync(target)) {
    throw new Error("refresh begin stopped: journal already exists; recover it first");
  }
  const parent = path.dirname(target);
  const prefix = `${path.basename(target)}.`;
  for (const name of fs.readdirSync(parent)) {
    if (name.startsWith(prefix) && name.endsWith(".tmp")) {
      fs.rmSync(path.join(parent, name), { force: true });
    }
  }
  write(root, {
    head: git(root, "rev-parse", "HEAD"),
    baseline: contents(root),
    checkpoint: currentHashes(root),
  });
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
  const uncheckpointed = [...new Set([...Object.keys(journal.checkpoint), ...Object.keys(now)])].filter(
    (name) => journal.checkpoint[name] !== now[name]
  );
  if (uncheckpointed.length) {
    throw new Error(
      `refresh classification stopped: uncheckpointed file changes: ${uncheckpointed.join(", ")}`
    );
  }
  const baseline = baselineHashes(journal.baseline);
  return [...new Set([...Object.keys(baseline), ...Object.keys(journal.checkpoint)])].filter(
    (name) => baseline[name] !== journal.checkpoint[name] && name !== "src/app/last-updated.ts"
  );
};

const isRunning = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (errorCode(error) !== "ESRCH") throw error;
    return false;
  }
};

const stagedPathsOf = (root: string): string[] =>
  execFileSync("git", ["diff", "--cached", "--name-only", "-z"], { cwd: root, encoding: "utf8" })
    .split("\0")
    .filter(Boolean);

const stagedHashOf = (root: string, name: string): string | undefined => {
  try {
    return hash(
      execFileSync("git", ["show", `:${name}`], { cwd: root, stdio: ["ignore", "pipe", "ignore"] })
    );
  } catch {
    return undefined;
  }
};

const refuseUnjournaledChanges = (root: string): void => {
  const changed = statusEntries(root);
  if (changed.length) {
    throw stopped(`worktree changes without a journal: ${changed.map((entry) => entry.name).join(", ")}`);
  }
};

const recoverCommittedRun = (root: string, journal: Journal): void => {
  if (git(root, "rev-parse", "HEAD^") !== journal.head || statusEntries(root).length) {
    throw stopped("HEAD changed");
  }
  const committed = git(root, "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD")
    .split("\n")
    .filter(Boolean);
  const known = outputNames(root);
  const hashes = currentHashes(root);
  if (
    !committed.length ||
    committed.some((name) => !known.has(name) || hashes[name] !== journal.checkpoint[name])
  ) {
    throw stopped("commit does not match the run checkpoint");
  }
  fs.rmSync(journalPath(root), { force: true });
};

const checkStagedPaths = (root: string, journal: Journal): string[] => {
  const stagedPaths = stagedPathsOf(root);
  if (!stagedPaths.length) return stagedPaths;
  const recorded = journal.staged;
  if (
    !recorded ||
    stagedPaths.length !== recorded.length ||
    stagedPaths.some((name) => !recorded.includes(name))
  ) {
    throw stopped("staged paths do not match the run journal");
  }
  for (const name of stagedPaths) {
    if (stagedHashOf(root, name) !== journal.checkpoint[name]) {
      throw stopped(`staged bytes differ from checkpoint ${name}`);
    }
  }
  return stagedPaths;
};

type OgPlan = "restore" | "discard" | null;

const planOgDirectory = (root: string, journal: Journal): OgPlan => {
  const expectedDeck = baselineTreeHash(OG_DECK, journal.baseline);
  if (!fs.existsSync(safePath(root, OG_DECK_PREVIOUS))) return null;
  if (treeHash(root, OG_DECK_PREVIOUS) !== expectedDeck) {
    throw stopped("unverified OG backup directory");
  }
  if (!fs.existsSync(safePath(root, OG_DECK))) return "restore";
  const deckHash = treeHash(root, OG_DECK);
  if (deckHash === stateTreeHash(OG_DECK, journal.checkpoint) || deckHash === expectedDeck) {
    return "discard";
  }
  throw stopped("OG target differs from its checkpoint");
};

const assertNoOrphanOgStages = (root: string): void => {
  const parent = path.dirname(path.join(root, OG_DECK));
  const orphanStages = fs.existsSync(parent)
    ? fs.readdirSync(parent).filter((name) => name.startsWith("deck-stage-"))
    : [];
  if (orphanStages.length) {
    throw stopped(`unowned OG staging directories: ${orphanStages.join(", ")}`);
  }
};

type SidecarPlan = { name: string; restore: boolean; removals: string[] };

type SidecarState = {
  root: string;
  journal: Journal;
  name: string;
  saved: string | undefined;
  full: string;
  names: ReturnType<typeof sidecarNames>;
  backup: string;
  marker: string;
  proof: string;
  hasTemporary: boolean;
  hasBackup: boolean;
  hasMarker: boolean;
};

const inspectSidecars = (root: string, journal: Journal, name: string): SidecarState => {
  const names = sidecarNames(name);
  const full = safePath(root, name);
  const temporary = safePath(root, names.temporary);
  const backup = safePath(root, names.backup);
  const marker = safePath(root, names.marker);
  const proof = safePath(root, names.proof);
  return {
    root,
    journal,
    name,
    saved: journal.baseline[name],
    full,
    names,
    backup,
    marker,
    proof,
    hasTemporary: fs.existsSync(temporary),
    hasBackup: fs.existsSync(backup),
    hasMarker: fs.existsSync(marker),
  };
};

const assertBackupIsBaseline = (state: SidecarState): void => {
  if (state.saved === undefined || hash(fs.readFileSync(state.backup)) !== savedHash(state.saved)) {
    throw stopped(`unowned backup ${state.backup}`);
  }
};

const assertCreatedMarkerEmpty = (state: SidecarState): void => {
  if (state.hasMarker && fs.statSync(state.marker).size !== 0) {
    throw stopped(`unproven created marker ${state.marker}`);
  }
};

const planInterruptedWrite = (state: SidecarState): SidecarPlan => {
  const { root, name, saved, full, names } = state;
  if (state.hasBackup) {
    if (fs.existsSync(full)) throw stopped(`unexpected target beside backup ${name}`);
    assertBackupIsBaseline(state);
    if (fs.existsSync(state.proof) && !provesTemporary(root, name)) {
      throw stopped(`unproven writer proof ${state.proof}`);
    }
    if (state.hasMarker !== (saved === undefined)) throw stopped(`unproven sidecar state ${name}`);
    assertCreatedMarkerEmpty(state);
  } else {
    if (!provesTemporary(root, name)) throw stopped(`unproven sidecar state ${name}`);
    if (state.hasMarker !== (saved === undefined)) throw stopped(`unproven sidecar state ${name}`);
    assertCreatedMarkerEmpty(state);
    if (saved === undefined && fs.existsSync(full)) {
      throw stopped(`unexpected target beside temporary write ${name}`);
    }
    if (
      saved !== undefined &&
      (!fs.existsSync(full) || hash(fs.readFileSync(full)) !== savedHash(saved))
    ) {
      throw stopped(`unproven target ${name}`);
    }
  }
  return {
    name,
    restore: state.hasBackup,
    removals: [names.temporary, names.proof, names.marker],
  };
};

const planProofOnlyLeftover = (state: SidecarState): SidecarPlan => {
  const { journal, name, full, names } = state;
  if (state.hasBackup || state.hasMarker || journal.baseline[name] !== undefined || fs.existsSync(full)) {
    throw stopped(`unverified completed write ${name}`);
  }
  const record = readProof(state.proof);
  if (!record || !proofIsWellFormed(record)) throw stopped(`unproven writer proof ${state.proof}`);
  return { name, restore: false, removals: [names.proof] };
};

const planCommittedWrite = (state: SidecarState): SidecarPlan => {
  const { root, journal, name, full, names } = state;
  const expected = journal.checkpoint[name];
  if (expected === undefined) return planProofOnlyLeftover(state);
  if (!fs.existsSync(full) || hash(fs.readFileSync(full)) !== expected) {
    throw stopped(`unverified completed write ${name}`);
  }
  if (state.hasBackup) assertBackupIsBaseline(state);
  if (fs.existsSync(state.proof) && !provesTarget(root, name)) {
    throw stopped(`unproven writer proof ${state.proof}`);
  }
  assertCreatedMarkerEmpty(state);
  if (state.hasMarker && journal.baseline[name] !== undefined) {
    throw stopped(`unproven sidecar state ${name}`);
  }
  return { name, restore: false, removals: [names.backup, names.proof, names.marker] };
};

const planSidecars = (root: string, journal: Journal): SidecarPlan[] => {
  const plans: SidecarPlan[] = [];
  for (const name of outputNames(root)) {
    const state = inspectSidecars(root, journal, name);
    if (state.hasTemporary) {
      plans.push(planInterruptedWrite(state));
    } else if (state.hasBackup || state.hasMarker || fs.existsSync(state.proof)) {
      plans.push(planCommittedWrite(state));
    }
  }
  return plans;
};

type AtomicPlan = { abandoned: string[]; orphanProofs: string[] };

const planAtomicTemporaries = (root: string): AtomicPlan => {
  const atomicTemps = new Map<string, { target: string; pid: number }>();
  const known = outputNames(root);
  for (const name of changedPaths(root)) {
    const parsed = atomicTemporary(name, known);
    if (parsed) atomicTemps.set(parsed.temporary, { target: parsed.target, pid: parsed.pid });
  }
  const plan: AtomicPlan = { abandoned: [], orphanProofs: [] };
  for (const [name, parsed] of atomicTemps) {
    const temporary = safePath(root, name);
    const owner = safePath(root, atomicProofName(name));
    const hasTemporary = fs.existsSync(temporary);
    if (!fs.existsSync(owner)) throw stopped(`unproven atomic temporary ${name}`);
    const invalid = atomicProofIssue(
      readProof(owner),
      { pid: parsed.pid, target: safePath(root, parsed.target), temporary: path.basename(name) },
      hasTemporary ? () => fs.readFileSync(temporary) : undefined
    );
    if (invalid) throw stopped(`invalid atomic temporary proof ${name}`);
    if (isRunning(parsed.pid)) throw stopped(`atomic writer is still active for ${name}`);
    (hasTemporary ? plan.abandoned : plan.orphanProofs).push(name);
  }
  return plan;
};

type RecoveryPlan = {
  stagedPaths: string[];
  ogPlan: OgPlan;
  sidecarPlans: SidecarPlan[];
  atomic: AtomicPlan;
};

const projectState = (root: string, journal: Journal, plan: RecoveryPlan): Hashes => {
  const projected = currentHashes(root);
  if (plan.ogPlan === "restore") {
    for (const name of safeFiles(root, OG_DECK_PREVIOUS)) {
      const leaf = name.slice(OG_DECK_PREVIOUS.length + 1);
      projected[`${OG_DECK}/${leaf}`] = hash(fs.readFileSync(safePath(root, name)));
    }
  }
  for (const sidecar of plan.sidecarPlans) {
    for (const removal of sidecar.removals) delete projected[removal];
    const saved = journal.baseline[sidecar.name];
    if (sidecar.restore && saved !== undefined) projected[sidecar.name] = savedHash(saved);
  }
  for (const name of [...plan.atomic.abandoned, ...plan.atomic.orphanProofs]) {
    delete projected[name];
    delete projected[atomicProofName(name)];
  }
  return projected;
};

const assertProjectionMatchesJournal = (journal: Journal, projected: Hashes): string[] => {
  const names = new Set([
    ...Object.keys(journal.baseline),
    ...Object.keys(projected),
    ...Object.keys(journal.checkpoint),
  ]);
  const baseline = baselineHashes(journal.baseline);
  const unexpected = [...names].filter(
    (name) => projected[name] !== journal.checkpoint[name] && projected[name] !== baseline[name]
  );
  if (unexpected.length) throw stopped(`unrecorded file changes: ${unexpected.join(", ")}`);
  return [...names];
};

const applyRecovery = (root: string, journal: Journal, plan: RecoveryPlan, names: string[]): void => {
  if (plan.stagedPaths.length) {
    execFileSync("git", ["restore", "--staged", "--", ...plan.stagedPaths], { cwd: root });
  }
  if (plan.ogPlan === "restore") {
    fs.renameSync(safePath(root, OG_DECK_PREVIOUS), safePath(root, OG_DECK));
  } else if (plan.ogPlan === "discard") {
    fs.rmSync(safePath(root, OG_DECK_PREVIOUS), { recursive: true, force: true });
  }
  for (const sidecar of plan.sidecarPlans) {
    if (sidecar.restore) {
      fs.renameSync(safePath(root, sidecarNames(sidecar.name).backup), safePath(root, sidecar.name));
    }
    for (const removal of sidecar.removals) fs.rmSync(safePath(root, removal), { force: true });
  }
  for (const name of plan.atomic.abandoned) {
    fs.rmSync(safePath(root, name), { force: true });
    fs.rmSync(safePath(root, atomicProofName(name)), { force: true });
  }
  for (const name of plan.atomic.orphanProofs) {
    fs.rmSync(safePath(root, atomicProofName(name)), { force: true });
  }
  for (const name of names) {
    const saved = journal.baseline[name];
    const full = safePath(root, name);
    if (saved === undefined) {
      fs.rmSync(full, { force: true });
    } else {
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, Buffer.from(saved, "base64"));
    }
  }
  fs.rmSync(journalPath(root), { force: true });
};

export const recoverRefresh = (root: string): void => {
  if (!fs.existsSync(journalPath(root))) {
    refuseUnjournaledChanges(root);
    return;
  }
  const journal = read(root);
  if (git(root, "rev-parse", "HEAD") !== journal.head) {
    recoverCommittedRun(root, journal);
    return;
  }
  assertKnownChanges(root);
  const stagedPaths = checkStagedPaths(root, journal);
  const ogPlan = planOgDirectory(root, journal);
  assertNoOrphanOgStages(root);
  const sidecarPlans = planSidecars(root, journal);
  const atomic = planAtomicTemporaries(root);
  const plan: RecoveryPlan = { stagedPaths, ogPlan, sidecarPlans, atomic };
  const names = assertProjectionMatchesJournal(journal, projectState(root, journal, plan));
  applyRecovery(root, journal, plan, names);
};

export const stageRefresh = (root: string): string[] => {
  assertKnownChanges(root);
  const journal = read(root);
  const now = currentHashes(root);
  const baseline = baselineHashes(journal.baseline);
  const changed = [...new Set([...Object.keys(baseline), ...Object.keys(now)])].filter(
    (name) => baseline[name] !== now[name]
  );
  const unexpected = changed.filter((name) => now[name] !== journal.checkpoint[name]);
  if (unexpected.length) {
    throw new Error(`refresh staging stopped: unrecorded file changes: ${unexpected.join(", ")}`);
  }
  const staged = changed.filter((name) => !name.startsWith("analysis/out/premium/"));
  journal.staged = staged;
  write(root, journal);
  if (staged.length) execFileSync("git", ["add", "--", ...staged], { cwd: root });
  return staged;
};

export const finishRefresh = (root: string): void => {
  fs.rmSync(journalPath(root), { force: true });
};

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
