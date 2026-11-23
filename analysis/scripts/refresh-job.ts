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
}

export const CANONICAL_REPO = "PocketDecks/pokemon-tcg-pocket-tier-list";
export const REFRESH_SUBJECT = "chore(data): refresh tier-list snapshot";

export const LOCK_RETRY_MARKERS = ["retry shortly", "so retry the run"] as const;
export const MANUAL_REPAIR_MARKERS = [
  "remove the lock file",
  "remove that claim file",
  "already exists in shard",
  "interrupted processed-tournaments",
] as const;

export const defaultRunner: Runner = (command) => {
  const spec = command.file === "yarn"
    ? commandSpecFor(process.execPath, process.env.npm_execpath ?? "", command.args, command.cwd)
    : command;
  const result = spawnSync(spec.file, spec.args, {
    cwd: spec.cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
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

export const needsPersonForRefusal = (output: string): boolean =>
  MANUAL_REPAIR_MARKERS.some((marker) => output.toLowerCase().includes(marker));

export const thrownDownloadError = (output: string): boolean =>
  /thrown|error:|exception/i.test(output);

export const copyRawStore = (root: string, date: string): string => {
  const target = path.join(root, "analysis", "data-backup", date);
  fs.cpSync(path.join(root, "analysis", "data"), target, { recursive: true });
  return target;
};

export interface RecordingRunner {
  runner: Runner;
  commands: () => CommandSpec[];
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
  return { runner, commands: () => commands };
};

export interface JobOptions {
  root: string;
  runner: Runner;
  date?: string;
  sleep?: (ms: number) => Promise<void>;
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
  const git = (args: string[], name: string): CommandSpec => make("git", args, root, name);

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
      firstErrorLines: lines.slice(0, 5),
      headSha: "",
      logPath: spec.logPath ?? logPath,
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
      const fetchMain = options.runner(git(["fetch", remote, "refs/heads/main:refs/remotes/" + remote + "/main"], "fetch-main"));
      if (fetchMain.status !== 0) failure("failed", "step 1", git(["fetch", remote, "refs/heads/main:refs/remotes/" + remote + "/main"], "fetch-main"), [fetchMain.stderr]);
      const forceBranch = options.runner(git(["branch", "-f", "main", `refs/remotes/${remote}/main`], "force-main"));
      if (forceBranch.status !== 0) failure("failed", "step 1", git(["branch", "-f", "main", `refs/remotes/${remote}/main`], "force-main"), [forceBranch.stderr]);
    }

    const fetchBranch = options.runner(git(["fetch", remote, branch], "fetch-dated"));
    const config = options.runner(git(["config", "user.email"], "git-email"));
    const automationEmail = config.stdout.trim();
    const localLog = options.runner(git(["log", `--format=%h%x1f%an%x1f%ae%x1f%s`, `main..${branch}`], "local-log"));
    const remoteLog = options.runner(git(["log", `--format=%h%x1f%an%x1f%ae%x1f%s`, `main..refs/remotes/${remote}/${branch}`], "remote-log"));
    const humans = [
      ...humanCommits(localLog.stdout, automationEmail),
      ...humanCommits(remoteLog.stdout, automationEmail),
    ];
    if (humans.length > 0) failure("needs-person", "step 2", git(["log", "--format=%h%x1f%an%x1f%ae%x1f%s", `main..${branch}`], "local-log"), humans);

    if (fetchBranch.status === 0) {
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
    let download = options.runner(downloadCommand);
    const firstOutput = `${download.stdout}\n${download.stderr}`;
    if (download.status !== 0) {
      if (download.status === null || download.signal) {
        failure("needs-person", "step 6", downloadCommand, ["yarn refresh:outputs discard", firstOutput]);
      }
      if (needsPersonForRefusal(firstOutput)) {
        copyRawStore(root, date);
        failure("needs-person", "step 6", downloadCommand, [firstOutput]);
      }
      if (storeLockRetry(firstOutput)) {
        await sleep(10_000);
        download = options.runner(downloadCommand);
        const retryOutput = `${download.stdout}\n${download.stderr}`;
        if (download.status !== 0) {
          if (needsPersonForRefusal(retryOutput)) {
            copyRawStore(root, date);
            failure("needs-person", "step 6", downloadCommand, [retryOutput]);
          }
          if (download.status === null || download.signal) {
            failure("needs-person", "step 6", downloadCommand, ["yarn refresh:outputs discard", retryOutput]);
          }
          failure("failed", "step 6", downloadCommand, [retryOutput]);
        }
      } else if (thrownDownloadError(firstOutput)) {
        download = options.runner(downloadCommand);
        const rerunOutput = `${download.stdout}\n${download.stderr}`;
        if (needsPersonForRefusal(rerunOutput)) {
          copyRawStore(root, date);
          failure("needs-person", "step 6", downloadCommand, [rerunOutput]);
        }
        if (download.status !== 0) failure("failed", "step 6", downloadCommand, [rerunOutput]);
      } else {
        failure("failed", "step 6", downloadCommand, [firstOutput]);
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
      simple("step 9", yarn(["refresh:outputs", "discard"], path.join(root, "analysis"), "discard"));
      return { status: "silent", step: "step 9", command: formatCommand(classifyCommand), firstErrorLines: [], headSha: "", logPath };
    }

    let values: PublishingValues;
    try {
      values = readPublishingValues(scratch, validateOutput);
    } catch (error) {
      failure("failed", "step 9", yarn(["validate:refresh"], scratchAnalysis, "validate"), [String(error)]);
    }

    simple("step 10", yarn(["publish:premium", "--dry-run"], scratchAnalysis, "premium-dry"));
    simple("step 10", yarn(["publish:premium"], scratchAnalysis, "premium-publish"));
    simple("step 10", yarn(["verify:premium"], scratchAnalysis, "premium-verify"));
    values.premiumVersion = readPremiumVersion(scratch);
    simple("step 11", yarn(["refresh:outputs", "stage"], path.join(root, "analysis"), "stage"));
    simple("step 11", git(["commit", "-m", REFRESH_SUBJECT], "commit"));

    simple("step 12", git(["push", remote, branch], "push"));
    const localHead = simple("step 12", git(["rev-parse", "HEAD"], "head"));
    const headSha = localHead.stdout.trim();
    const body = buildPrBody(values);
    const existing = options.runner(make("gh", ["pr", "view", branch, "--json", "number", "--jq", ".number"], root, "pr-view"));
    const prCommand = existing.status === 0 && existing.stdout.trim()
      ? make("gh", ["pr", "edit", existing.stdout.trim(), "--body", body], root, "pr-edit")
      : make("gh", ["pr", "create", "--base", "main", "--head", branch, "--title", REFRESH_SUBJECT, "--body", body], root, "pr-create");
    simple("step 12", prCommand);

    const readBack = simple("step 13", make("gh", ["pr", "view", branch, "--json", "headRefOid,url"], root, "pr-readback"));
    const parsed = JSON.parse(readBack.stdout) as { headRefOid: string };
    if (parsed.headRefOid !== headSha) {
      failure("failed", "step 13", make("gh", ["pr", "view", branch, "--json", "headRefOid,url"], root, "pr-readback"), [headSha, parsed.headRefOid]);
    }
    return { status: "published", step: "step 13", command: "", firstErrorLines: [], headSha, logPath };
  } catch (error) {
    if (error instanceof JobStop) return error.outcome;
    return { status: "failed", step, command: commandText, firstErrorLines: [String(error)], headSha: "", logPath };
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
    void runJob({ root, runner: recorder.runner }).then((outcome) => {
      for (const spec of recorder.commands()) console.log(formatCommand(spec));
      console.log(JSON.stringify({
        dryRun: true,
        status: outcome.status,
        step: outcome.step,
        commandCount: recorder.commands().length,
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

