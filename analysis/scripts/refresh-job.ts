import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { windowArtefactName, windowDataFile, WINDOW_IDS, isPremiumWindow } from "../../src/types/meta-windows";
import { PREMIUM_ARTEFACT_NAMES, PREMIUM_DIR } from "../src/utils/premium-artefacts";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PREMIUM_RELATIVE_DIR = path.relative(REPO_ROOT, PREMIUM_DIR).split(path.sep).join("/");

export type JobStatus = "published" | "silent" | "needs-person" | "failed";

export interface CommandSpec {
  file: string;
  args: string[];
  cwd?: string;
  logPath?: string;
  env?: Record<string, string>;
}

export interface CommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: string;
  signal?: string | null;
}

export type Runner = (command: CommandSpec) => CommandResult;

export interface JobOutcome {
  status: JobStatus;
  step: string;
  command: string;
  firstErrorLines: string[];
  headSha: string;
  logPath: string;
  reviewUrl: string;
}

export const CANONICAL_REPO = "PocketDecks/pokemon-tcg-pocket-tier-list";
export const REFRESH_SUBJECT = "chore(data): refresh tier-list snapshot";

export const LOCK_RETRY_MARKERS = ["retry shortly", "so retry the run"] as const;
export const MANUAL_REPAIR_MARKERS = [
  "remove the lock file",
  "remove that claim file",
  "already exists in shard",
  "interrupted processed-tournaments",
  "keep the write blocked",
] as const;

export const defaultRunner: Runner = (command) => {
  const spec = command.file === "yarn"
    ? commandSpecFor(process.execPath, process.env.npm_execpath ?? "", command.args, command.cwd)
    : command;
  const result = spawnSync(spec.file, spec.args, {
    cwd: spec.cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, ...command.env },
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  if (command.logPath) {
    fs.mkdirSync(path.dirname(command.logPath), { recursive: true });
    fs.appendFileSync(command.logPath, `$ ${spec.file} ${spec.args.join(" ")}\n--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}\n`);
  }
  return {
    status: result.status,
    stdout,
    stderr,
    error: result.error?.message,
    signal: result.signal,
  };
};

export const formatCommand = (command: CommandSpec): string =>
  `${command.cwd ? `[${command.cwd}] ` : ""}${command.file} ${command.args.join(" ")}`.trim();

export const findCanonicalRemote = (remoteList: string): string | null => {
  for (const line of remoteList.split(/\r?\n/)) {
    if (!line.includes("(fetch)")) continue;
    const match = line.match(/^([^\s]+)\s+(\S+)\s+\(fetch\)$/);
    if (!match) continue;
    const url = match[2];
    if (url.includes(CANONICAL_REPO)) return match[1];
  }
  return null;
};

export const humanCommits = (log: string, automationEmail: string): string[] =>
  log
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .filter((line) => {
      const fields = line.split("\x1f");
      if (fields.length < 4) return true;
      return !(fields[3] === REFRESH_SUBJECT && fields[2] === automationEmail);
    });

export const isSilentDay = (classifyOutput: string): boolean =>
  classifyOutput.trim().length === 0;

const prState = (output: string): { number: number; state: string } | null => {
  try {
    const parsed = JSON.parse(output) as { number?: number; state?: string };
    return typeof parsed.number === "number" && typeof parsed.state === "string"
      ? { number: parsed.number, state: parsed.state }
      : null;
  } catch {
    return null;
  }
};

const commitSummaries = (log: string): string[] =>
  log
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => line.split("\x1f").join(" "));

export const parseScratchPath = (beginOutput: string): string | null => {
  const line = beginOutput
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => /[\\/]/.test(entry) && !entry.startsWith("$") && !entry.includes("yarn"));
  return line ?? null;
};

export interface PublishingValues {
  tournaments: number;
  decks: number;
  windows: string;
  imageParity: string;
  premiumVersion: string;
}

export const readRequiredNodeVersion = (root: string): string => {
  const file = path.join(root, ".nvmrc");
  let value: string;
  try {
    value = fs.readFileSync(file, "utf8").trim().replace(/^v/, "");
  } catch (error) {
    throw new Error(`cannot read ${file}: ${String(error)}`, { cause: error });
  }
  if (!value) throw new Error(`${file} has no Node version`);
  return value;
};

export const readPublishingValues = (scratchRoot: string, validateOutput: string): PublishingValues => {
  const dataDir = path.join(scratchRoot, "analysis", "data");
  const processed = JSON.parse(fs.readFileSync(path.join(dataDir, "processed-tournaments.json"), "utf8")) as unknown;
  if (!Array.isArray(processed)) throw new Error("processed-tournaments.json is not an array");
  const manifest = JSON.parse(fs.readFileSync(path.join(dataDir, "decks", "manifest.json"), "utf8")) as {
    schema?: number;
    shards?: Record<string, { count?: number }>;
  };
  if (manifest.schema !== 1 || !manifest.shards || typeof manifest.shards !== "object") {
    throw new Error("decks/manifest.json has no shard counts");
  }
  const decks = Object.values(manifest.shards).reduce(
    (total, shard) => total + (typeof shard.count === "number" ? shard.count : 0),
    0
  );
  const windows = WINDOW_IDS.map((window) => {
    const name = windowArtefactName("best-decks", window);
    const premium = isPremiumWindow(window);
    if (premium && !PREMIUM_ARTEFACT_NAMES.includes(name)) throw new Error(`${name} is not a premium artefact`);
    const file = premium
      ? path.join(scratchRoot, PREMIUM_RELATIVE_DIR, `${name}.json`)
      : path.join(scratchRoot, "public", "data", windowDataFile("best-decks", window));
    const value = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
    return `${window}: ${Array.isArray(value) ? value.length : 0}`;
  }).join(", ");
  const parity = validateOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^union:/i.test(line));
  if (!parity) throw new Error("validate:refresh printed no image parity line");
  return {
    tournaments: processed.length,
    decks,
    windows,
    imageParity: parity,
    premiumVersion: readPremiumVersion(scratchRoot),
  };
};

export const readPremiumVersion = (root: string): string => {
  const value = JSON.parse(fs.readFileSync(path.join(root, "public", "data", "data-version.json"), "utf8")) as { premium?: string };
  if (!value.premium) throw new Error("data-version.json has no premium version");
  return value.premium;
};

export const buildPrBody = (input: PublishingValues): string =>
  [
    `- Tournament data: ${input.tournaments} tournaments processed, ${input.decks} decks`,
    `- Ranked archetypes: ${input.windows}`,
    `- Image parity: ${input.imageParity}`,
    `- Premium data version \`${input.premiumVersion}\` in \`data-version.json\``,
  ].join("\n");

export const commandSpecFor = (execPath: string, npmExecPath: string, args: string[], cwd?: string): CommandSpec => {
  const yarnScript = npmExecPath.replace(/\\/g, "/");
  if (!/(^|\/)yarn\.(js|cjs)$/.test(yarnScript)) {
    throw new Error(`npm_execpath must point at yarn.js or yarn.cjs, got ${npmExecPath}`);
  }
  return { file: execPath, args: [npmExecPath, "--silent", ...args], cwd };
};

export const nodeSpecFor = (execPath: string, script: string, cwd?: string): CommandSpec => ({ file: execPath, args: [script], cwd });

export const storeLockRetry = (output: string): boolean =>
  LOCK_RETRY_MARKERS.some((marker) => output.toLowerCase().includes(marker));

export const isMissingRemoteBranch = (output: string): boolean =>
  /couldn't find remote ref/i.test(output);

export const isMainFetchRejection = (output: string): boolean =>
  /\[rejected\][^\n]*\(non-fast-forward\)/i.test(output);

export const needsPersonForRefusal = (output: string): boolean =>
  MANUAL_REPAIR_MARKERS.some((marker) => output.toLowerCase().includes(marker));

export const thrownDownloadError = (output: string): boolean =>
  /thrown|error:|exception/i.test(output);

export type DownloadDecision = "retry" | "needs-person" | "rerun" | "fail";

export const classifyDownloadFailure = (output: string): DownloadDecision => {
  if (storeLockRetry(output)) return "retry";
  if (needsPersonForRefusal(output)) return "needs-person";
  if (thrownDownloadError(output)) return "rerun";
  return "fail";
};

const MAX_ERROR_LINES = 5;
const MAX_ERROR_LINE_CHARS = 500;
const MAX_ERROR_REPORT_CHARS = 3_000;

const firstErrorReport = (entries: string[]): string[] => {
  const lines = entries
    .flatMap((entry) => entry.split(/\r?\n/))
    .map((line) => line.trim())
    .filter(Boolean);
  const isInstruction = (line: string): boolean => /^yarn(?:\.cmd)?\s/.test(line);
  const instruction = lines.filter(isInstruction);
  const instructionSet = new Set(instruction);
  const decided = lines.filter((line) =>
    !instructionSet.has(line) && (needsPersonForRefusal(line) || storeLockRetry(line))
  );
  const decidedSet = new Set(decided);
  const otherError = lines.filter((line) =>
    !instructionSet.has(line) && !decidedSet.has(line) && /error|ENOENT|ENOBUFS|exception|refused/i.test(line)
  );
  const errorSet = new Set([...decided, ...otherError]);
  const progress = lines.filter((line) => !instructionSet.has(line) && !errorSet.has(line));
  const chosen = [
    ...instruction,
    ...decided,
    ...otherError.slice(-MAX_ERROR_LINES),
    ...progress.slice(-MAX_ERROR_LINES),
  ];
  const report: string[] = [];
  let budget = MAX_ERROR_REPORT_CHARS;
  for (const line of chosen) {
    if (report.length === MAX_ERROR_LINES || budget <= 0) break;
    const text = line.slice(0, Math.min(MAX_ERROR_LINE_CHARS, budget));
    report.push(text);
    budget -= text.length + 1;
  }
  return report;
};

export const copyRawStore = (root: string, date: string): string => {
  const target = path.join(root, "analysis", "data-backup", date);
  fs.cpSync(path.join(root, "analysis", "data"), target, { recursive: true });
  return target;
};

export interface RecordingRunner {
  runner: Runner;
  commands: () => CommandSpec[];
  publishingValues: PublishingValues;
}

export const createRecordingRunner = (scratch: string, headSha = "dry-run-head"): RecordingRunner => {
  const commands: CommandSpec[] = [];
  const runner: Runner = (command) => {
    commands.push(command);
    const text = command.args.join(" ");
    if (text.startsWith("remote -v")) {
      return { status: 0, stdout: `pocket\thttps://github.com/${CANONICAL_REPO}.git (fetch)\n`, stderr: "" };
    }
    if (text.startsWith("rev-parse --abbrev-ref")) return { status: 0, stdout: "feature/dry-run\n", stderr: "" };
    if (text.startsWith("config user.email")) return { status: 0, stdout: "bot@example.invalid\n", stderr: "" };
    if (text.startsWith("rev-parse HEAD")) return { status: 0, stdout: headSha, stderr: "" };
    if (text.startsWith("refresh:outputs begin")) return { status: 0, stdout: `${scratch}\n`, stderr: "" };
    if (text.startsWith("refresh:outputs classify")) return { status: 0, stdout: "public/data/best-decks.json\n", stderr: "" };
    if (text.startsWith("validate:refresh")) {
      return { status: 0, stdout: "union: 3 deck names, 3 OG images, 0 missing, 0 orphan\n", stderr: "" };
    }
    if (text.startsWith("pr view") && command.args.includes("headRefOid,url")) {
      return { status: 0, stdout: `${JSON.stringify({ headRefOid: headSha, url: "https://github.com/pr/dry-run" })}\n`, stderr: "" };
    }
    if (text.startsWith("pr view")) return { status: 1, stdout: "", stderr: "" };
    return { status: 0, stdout: "", stderr: "" };
  };
  const publishingValues: PublishingValues = {
    tournaments: 0,
    decks: 0,
    windows: WINDOW_IDS.map((window) => `${window}: 0`).join(", "),
    imageParity: "union: 0 deck names, 0 OG images, 0 missing, 0 orphan",
    premiumVersion: "dry-run",
  };
  return { runner, commands: () => commands, publishingValues };
};

export interface JobOptions {
  root: string;
  runner: Runner;
  date?: string;
  sleep?: (ms: number) => Promise<void>;
  publishingValues?: PublishingValues;
}

class JobStop extends Error {
  outcome: JobOutcome;

  constructor(outcome: JobOutcome) {
    super(outcome.step);
    this.outcome = outcome;
  }
}

export const runJob = async (options: JobOptions): Promise<JobOutcome> => {
  const root = options.root;
  const date = options.date ?? new Date().toISOString().slice(0, 10);
  const branch = `automated/pipeline-update-${date}`;
  const logDir = path.join(root, "analysis", ".refresh-logs", date);
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let step = "start";
  let commandText = "";
  let logPath = path.join(logDir, "job.log");

  const make = (file: string, args: string[], cwd = root, name = "command"): CommandSpec => {
    logPath = path.join(logDir, `${name}.log`);
    return { file, args, cwd, logPath };
  };
  const yarn = (args: string[], cwd: string, name: string): CommandSpec => make("yarn", args, cwd, name);
  const git = (args: string[], name: string): CommandSpec => ({
    ...make("git", args, root, name),
    env: { LC_ALL: "C", LANGUAGE: "" },
  });

  function failure(
    status: JobStatus,
    at: string,
    spec: CommandSpec,
    lines: string[]
  ): never {
    throw new JobStop({
      status,
      step: at,
      command: formatCommand(spec),
      firstErrorLines: firstErrorReport(lines),
      headSha: "",
      logPath: spec.logPath ?? logPath,
      reviewUrl: "",
    });
  }

  try {
    const nodeSpec = make("node", ["--version"], root, "node-version");
    let requiredNode: string;
    try {
      requiredNode = readRequiredNodeVersion(root);
    } catch (error) {
      failure("needs-person", "prerequisite", nodeSpec, [String(error)]);
    }
    if (process.version.replace(/^v/, "") !== requiredNode) {
      failure("needs-person", "prerequisite", nodeSpec, [
        `Node ${process.version} does not match .nvmrc ${requiredNode}`,
        "Run the refresh with the Node version in .nvmrc",
      ]);
    }

    const indexCommand = git(["diff", "--cached", "--name-only"], "index-check");
    const staged = options.runner(indexCommand);
    if (staged.status !== 0) failure("failed", "step 1", indexCommand, [staged.stderr]);
    const stagedPaths = staged.stdout.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
    if (stagedPaths.length > 0) {
      failure("needs-person", "step 1", indexCommand, [`index already holds entries: ${stagedPaths.join(", ")}`]);
    }

    const remotes = options.runner(git(["remote", "-v"], "remote-list"));
    if (remotes.status !== 0) failure("failed", "step 1", git(["remote", "-v"], "remote-list"), [remotes.error ?? remotes.stderr]);
    const remote = findCanonicalRemote(remotes.stdout) ?? "";
    if (!remote) failure("needs-person", "step 1", git(["remote", "-v"], "remote-list"), [CANONICAL_REPO]);

    const current = options.runner(git(["rev-parse", "--abbrev-ref", "HEAD"], "current-branch"));
    if (current.status !== 0) failure("failed", "step 1", git(["rev-parse", "--abbrev-ref", "HEAD"], "current-branch"), [current.stderr]);
    const onMain = current.stdout.trim() === "main";
    if (onMain) {
      const pull = options.runner(git(["pull", "--ff-only", remote, "main"], "pull-main"));
      if (pull.status !== 0) failure("failed", "step 1", git(["pull", "--ff-only", remote, "main"], "pull-main"), [pull.stderr]);
    } else {
      const mainCommand = git(["fetch", "--show-forced-updates", remote, "refs/heads/main:refs/heads/main"], "fetch-main");
      const fetchMain = options.runner(mainCommand);
      if (fetchMain.status !== 0) {
        const output = fetchMain.stderr || fetchMain.stdout || fetchMain.error || "";
        const rejected = isMainFetchRejection(output);
        failure(rejected ? "needs-person" : "failed", "step 1", mainCommand, rejected ? ["main", output] : [output]);
      }
    }

    const fetchCommand = git(["fetch", remote, branch], "fetch-dated");
    const fetchBranch = options.runner(fetchCommand);
    const remoteExists = fetchBranch.status === 0;
    if (!remoteExists && !isMissingRemoteBranch(fetchBranch.stderr)) {
      failure("failed", "step 2", fetchCommand, [fetchBranch.stderr || fetchBranch.error || "git fetch failed"]);
    }
    const localCommand = git(["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], "local-dated");
    const localBranch = options.runner(localCommand);
    const localExists = localBranch.status === 0;
    const config = options.runner(git(["config", "user.email"], "git-email"));
    const automationEmail = config.stdout.trim();
    const humans: string[] = [];
    let humanCommand = localCommand;
    if (localExists) {
      humanCommand = git(["log", `--format=%h%x1f%an%x1f%ae%x1f%s`, `main..${branch}`], "local-log");
      const localLog = options.runner(humanCommand);
      if (localLog.status !== 0) failure("failed", "step 2", humanCommand, [localLog.stderr]);
      humans.push(...humanCommits(localLog.stdout, automationEmail));
    }
    if (remoteExists) {
      humanCommand = git(["log", `--format=%h%x1f%an%x1f%ae%x1f%s`, `main..refs/remotes/${remote}/${branch}`], "remote-log");
      const remoteLog = options.runner(humanCommand);
      if (remoteLog.status !== 0) failure("failed", "step 2", humanCommand, [remoteLog.stderr]);
      humans.push(...humanCommits(remoteLog.stdout, automationEmail));
    }
    if (humans.length > 0) failure("needs-person", "step 2", humanCommand, humans);

    if (localExists || remoteExists) {
      const checkout = options.runner(git(["checkout", branch], "checkout-dated"));
      if (checkout.status !== 0) failure("failed", "step 2", git(["checkout", branch], "checkout-dated"), [checkout.stderr]);
    } else {
      const create = options.runner(git(["checkout", "-b", branch, "main"], "create-dated"));
      if (create.status !== 0) failure("failed", "step 2", git(["checkout", "-b", branch, "main"], "create-dated"), [create.stderr]);
    }

    const simple = (at: string, spec: CommandSpec): CommandResult => {
      step = at;
      commandText = formatCommand(spec);
      const result = options.runner(spec);
      if (result.error) failure("failed", at, spec, [result.error]);
      if (result.status !== 0) failure("failed", at, spec, [result.stderr || result.stdout]);
      return result;
    };

    const begin = simple("step 3", yarn(["refresh:outputs", "begin"], path.join(root, "analysis"), "begin"));
    const scratch = parseScratchPath(begin.stdout) ?? "";
    if (!scratch) failure("failed", "step 3", yarn(["refresh:outputs", "begin"], path.join(root, "analysis"), "begin"), [begin.stdout]);
    const scratchAnalysis = path.join(scratch, "analysis");
    simple("step 3", yarn(["sync-pairings"], scratchAnalysis, "sync"));
    simple("step 4", yarn(["golden:generate"], scratchAnalysis, "golden"));

    const verifyCommand = yarn(["store:verify"], scratchAnalysis, "verify");
    const verify = options.runner(verifyCommand);
    if (verify.status !== 0) {
      const backup = copyRawStore(root, date);
      failure("needs-person", "step 5", verifyCommand, [backup, verify.stderr]);
    }

    const downloadCommand = yarn(["download"], scratchAnalysis, "download");
    const outputOf = (result: CommandResult): string => `${result.stdout}\n${result.stderr}${result.error ? `\n${result.error}` : ""}`;
    const stopWithBackup = (output: string): never => {
      copyRawStore(root, date);
      failure("needs-person", "step 6", downloadCommand, [output]);
    };
    const stopForDiscard = (output: string): never =>
      failure("needs-person", "step 6", downloadCommand, ["yarn refresh:outputs discard", output]);

    let download = options.runner(downloadCommand);
    let output = outputOf(download);
    if (download.status !== 0) {
      if (download.status === null || download.signal) stopForDiscard(output);
      const decision = classifyDownloadFailure(output);
      if (decision === "retry") {
        await sleep(10_000);
        download = options.runner(downloadCommand);
        output = outputOf(download);
        if (download.status !== 0) {
          if (download.status === null || download.signal) stopForDiscard(output);
          if (classifyDownloadFailure(output) === "needs-person") stopWithBackup(output);
          failure("failed", "step 6", downloadCommand, [output]);
        }
      } else if (decision === "needs-person") {
        stopWithBackup(output);
      } else if (decision === "rerun") {
        download = options.runner(downloadCommand);
        output = outputOf(download);
        if (download.status === null || download.signal) stopForDiscard(output);
        if (classifyDownloadFailure(output) === "needs-person") stopWithBackup(output);
        if (download.status !== 0) failure("failed", "step 6", downloadCommand, [output]);
      } else {
        failure("failed", "step 6", downloadCommand, [output]);
      }
    }

    simple("step 7", yarn(["card-printings:generate"], scratchAnalysis, "printings"));
    simple("step 7", yarn(["start"], scratchAnalysis, "start"));
    simple("step 7", nodeSpecFor(process.execPath, "scripts/build-deck-archive.mjs", scratch));
    simple("step 7", nodeSpecFor(process.execPath, "scripts/generate-deck-hub-slugs.mjs", scratch));
    simple("step 7", nodeSpecFor(process.execPath, "scripts/generate-deck-redirects.mjs", scratch));
    const validate = simple("step 7", yarn(["validate:refresh"], scratchAnalysis, "validate"));
    const validateOutput = `${validate.stdout}\n${validate.stderr}`;
    simple("step 8", yarn(["test"], scratchAnalysis, "analysis-test"));
    simple("step 8", yarn(["typecheck"], scratchAnalysis, "analysis-typecheck"));
    simple("step 8", yarn(["typecheck"], scratch, "root-typecheck"));
    simple("step 8", yarn(["lint"], scratch, "root-lint"));
    simple("step 8", yarn(["test:ci"], scratch, "root-test-ci"));
    simple("step 8", yarn(["check:generated"], scratch, "check-generated"));

    const classifyCommand = yarn(["refresh:outputs", "classify"], path.join(root, "analysis"), "classify");
    const classify = options.runner(classifyCommand);
    if (classify.status !== 0) failure("failed", "step 9", classifyCommand, [classify.stderr]);
    if (isSilentDay(classify.stdout)) {
      const automationLogCommand = git(["log", "--format=%h%x1f%an%x1f%ae%x1f%s", `main..${branch}`], "silent-branch-log");
      const automationLog = options.runner(automationLogCommand);
      if (automationLog.status !== 0) failure("failed", "step 9", automationLogCommand, [automationLog.stderr]);
      const automationCommits = commitSummaries(automationLog.stdout);
      if (remoteExists) {
        const remoteAutomationCommand = git(["log", "--format=%h%x1f%an%x1f%ae%x1f%s", `main..refs/remotes/${remote}/${branch}`], "silent-remote-log");
        const remoteAutomationLog = options.runner(remoteAutomationCommand);
        if (remoteAutomationLog.status !== 0) failure("failed", "step 9", remoteAutomationCommand, [remoteAutomationLog.stderr]);
        automationCommits.push(...commitSummaries(remoteAutomationLog.stdout));
      }
      const uniqueHashes = new Set<string>();
      const distinctCommits = automationCommits.filter((line) => {
        const hash = line.split(" ", 1)[0];
        if (uniqueHashes.has(hash)) return false;
        uniqueHashes.add(hash);
        return true;
      });
      if (distinctCommits.length > 0) {
        const base = remoteExists ? `refs/remotes/${remote}/${branch}` : "main";
        const unpublishedCommand = git(["log", "--format=%h%x1f%an%x1f%ae%x1f%s", `${base}..${branch}`], "unpublished-log");
        const unpublishedLog = options.runner(unpublishedCommand);
        if (unpublishedLog.status !== 0) failure("failed", "step 9", unpublishedCommand, [unpublishedLog.stderr]);
        const unpublished = commitSummaries(unpublishedLog.stdout);
        if (unpublished.length > 0) {
          failure("needs-person", "step 9", unpublishedCommand, [`unpublished commits on ${branch}`, ...unpublished]);
        }
        const prCheckCommand = make("gh", ["pr", "view", branch, "--repo", CANONICAL_REPO, "--json", "number,state"], root, "pr-check");
        const prCheck = options.runner(prCheckCommand);
        const checked = prState(prCheck.stdout);
        if (prCheck.status !== 0 || !checked || checked.state !== "OPEN") {
          failure("needs-person", "step 9", prCheckCommand, [`no open pull request for ${branch}`, ...distinctCommits]);
        }
      }
      simple("step 9", yarn(["refresh:outputs", "discard"], path.join(root, "analysis"), "discard"));
      return { status: "silent", step: "step 9", command: formatCommand(classifyCommand), firstErrorLines: [], headSha: "", logPath, reviewUrl: "" };
    }

    let values: PublishingValues;
    if (options.publishingValues) {
      values = { ...options.publishingValues };
    } else {
      try {
        values = readPublishingValues(scratch, validateOutput);
      } catch (error) {
        failure("failed", "step 9", yarn(["validate:refresh"], scratchAnalysis, "validate"), [String(error)]);
      }
    }

    simple("step 10", yarn(["publish:premium", "--dry-run"], scratchAnalysis, "premium-dry"));
    simple("step 10", yarn(["publish:premium"], scratchAnalysis, "premium-publish"));
    simple("step 10", yarn(["verify:premium"], scratchAnalysis, "premium-verify"));
    if (!options.publishingValues) values.premiumVersion = readPremiumVersion(scratch);
    const stage = simple("step 11", yarn(["refresh:outputs", "stage"], path.join(root, "analysis"), "stage"));
    const generatedPaths = stage.stdout.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
    const indexed = simple("step 11", git(["diff", "--cached", "--name-only"], "index-paths"));
    const indexPaths = indexed.stdout.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
    const outside = indexPaths.filter((entry) => !generatedPaths.includes(entry));
    if (outside.length > 0) {
      failure("needs-person", "step 11", git(["commit", "-m", REFRESH_SUBJECT, "--", ...generatedPaths], "commit"), [`index has entries outside generated paths: ${outside.join(", ")}`]);
    }
    simple("step 11", git(["commit", "-m", REFRESH_SUBJECT, "--", ...generatedPaths], "commit"));

    simple("step 12", git(["push", remote, branch], "push"));
    const localHead = simple("step 12", git(["rev-parse", "HEAD"], "head"));
    const headSha = localHead.stdout.trim();
    const body = buildPrBody(values);
    const existing = options.runner(make("gh", ["pr", "view", branch, "--repo", CANONICAL_REPO, "--json", "number,state"], root, "pr-view"));
    const found = existing.status === 0 ? prState(existing.stdout) : null;
    const prCommand = found?.state === "OPEN"
      ? make("gh", ["pr", "edit", String(found.number), "--repo", CANONICAL_REPO, "--body", body], root, "pr-edit")
      : make("gh", ["pr", "create", "--repo", CANONICAL_REPO, "--base", "main", "--head", branch, "--title", REFRESH_SUBJECT, "--body", body], root, "pr-create");
    simple("step 12", prCommand);

    const readBackCommand = make("gh", ["pr", "view", branch, "--repo", CANONICAL_REPO, "--json", "headRefOid,url"], root, "pr-readback");
    const readBack = simple("step 13", readBackCommand);
    const parsed = JSON.parse(readBack.stdout) as { headRefOid: string; url: string };
    if (parsed.headRefOid !== headSha) {
      failure("failed", "step 13", readBackCommand, [headSha, parsed.headRefOid]);
    }
    return { status: "published", step: "step 13", command: "", firstErrorLines: [], headSha, logPath, reviewUrl: parsed.url };
  } catch (error) {
    if (error instanceof JobStop) return error.outcome;
    return { status: "failed", step, command: commandText, firstErrorLines: [String(error)], headSha: "", logPath, reviewUrl: "" };
  }
};

const invokedDirectly = process.argv[1] ? path.resolve(process.argv[1]) === __filename : false;

if (invokedDirectly) {
  const root = path.resolve(__dirname, "..", "..");
  const exitFor = (outcome: JobOutcome): void => {
    process.exitCode = outcome.status === "published" || outcome.status === "silent" ? 0 : outcome.status === "needs-person" ? 2 : 1;
  };
  if (process.argv.slice(2).includes("--dry-run")) {
    const recorder = createRecordingRunner(root);
    void runJob({ root, runner: recorder.runner, publishingValues: recorder.publishingValues }).then((outcome) => {
      for (const spec of recorder.commands()) console.log(formatCommand(spec));
      console.log(JSON.stringify({
        dryRun: true,
        status: outcome.status,
        step: outcome.step,
        commandCount: recorder.commands().length,
        reviewUrl: outcome.reviewUrl,
      }));
      exitFor(outcome);
    });
  } else {
    void runJob({ root, runner: defaultRunner }).then((outcome) => {
      console.log(JSON.stringify(outcome));
      exitFor(outcome);
    });
  }
}

