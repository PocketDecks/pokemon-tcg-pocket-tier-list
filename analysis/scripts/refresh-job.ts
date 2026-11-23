import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

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

export interface PrBodyInput {
  pairingRows: number;
  rankedArchetypes: number;
  imageParity: string;
  testResults: string;
  premiumVersion: string;
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

export const defaultRunner: Runner = ({ file, args, cwd, logPath }) => {
  const isYarn = file === "yarn" || file === "yarn.cmd";
  const commandFile = isYarn ? process.execPath : file;
  const commandArgs = isYarn
    ? [process.env.npm_execpath ?? "", "--silent", ...args]
    : args;
  const result = spawnSync(commandFile, commandArgs, {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  if (logPath) {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `$ ${commandFile} ${commandArgs.join(" ")}\n--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}\n`);
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

export const buildPrBody = (input: PrBodyInput): string =>
  [
    `- Tournament rows: ${input.pairingRows}`,
    `- Ranked archetypes: ${input.rankedArchetypes}`,
    `- Image parity: ${input.imageParity}`,
    `- Tests: ${input.testResults}`,
    `- Premium data version \`${input.premiumVersion}\` in \`data-version.json\``,
  ].join("\n");

const jsonCount = (root: string, relative: string): number => {
  const value = JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
  if (!Array.isArray(value)) throw new Error(`${relative} is not an array`);
  return value.length;
};

export const readPrBodyValues = (root: string): PrBodyInput => {
  const pairingRows = jsonCount(root, "analysis/src/data/limitless-decks.json");
  const ranked = JSON.parse(fs.readFileSync(path.join(root, "public/data/best-decks.json"), "utf8")) as unknown;
  const tiers = ranked as Record<string, unknown>;
  const archetypes = Array.isArray(ranked)
    ? ranked.length
    : Object.values(tiers).reduce<number>((total, entry) => {
        if (Array.isArray(entry)) return total + entry.length;
        if (entry && typeof entry === "object" && Array.isArray((entry as { decks?: unknown }).decks)) {
          return total + (entry as { decks: unknown[] }).decks.length;
        }
        return total;
      }, 0);
  const version = JSON.parse(fs.readFileSync(path.join(root, "public/data/data-version.json"), "utf8")) as { premium?: string };
  if (!version.premium) throw new Error("data-version.json has no premium version");
  const images = fs.readdirSync(path.join(root, "public/og/deck")).filter((name) => name.endsWith(".png")).length;
  return {
    pairingRows,
    rankedArchetypes: archetypes,
    imageParity: images === archetypes ? `${images} images for ${archetypes} archetypes` : `${images} images for ${archetypes} archetypes, mismatch`,
    testResults: "all step 8 commands passed",
    premiumVersion: version.premium,
  };
};

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

export interface JobOptions {
  root: string;
  runner: Runner;
  date?: string;
  dryRun?: boolean;
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
  const yarn = (args: string[], cwd: string, name: string): CommandSpec =>
    make(process.platform === "win32" ? "yarn.cmd" : "yarn", args, cwd, name);
  const git = (args: string[], name: string): CommandSpec => make("git", args, root, name);

  const failure = (
    status: JobStatus,
    at: string,
    spec: CommandSpec,
    lines: string[]
  ): never => {
    throw new JobStop({
      status,
      step: at,
      command: formatCommand(spec),
      firstErrorLines: lines.slice(0, 5),
      headSha: "",
      logPath: spec.logPath ?? logPath,
    });
  };

  try {
    if (options.dryRun) {
      const planned: CommandSpec[] = [
        git(["remote", "-v"], "remote-list"),
        git(["fetch", "canonical", "refs/heads/main:refs/remotes/canonical/main"], "fetch-main"),
        git(["fetch", "canonical", branch], "fetch-dated"),
        git(["checkout", branch], "checkout-dated"),
        yarn(["refresh:outputs", "begin"], path.join(root, "analysis"), "begin"),
        yarn(["sync-pairings"], path.join(root, "analysis"), "sync"),
        yarn(["golden:generate"], path.join(root, "analysis"), "golden"),
        yarn(["store:verify"], path.join(root, "analysis"), "verify"),
        yarn(["download"], path.join(root, "analysis"), "download"),
        yarn(["card-printings:generate"], path.join(root, "analysis"), "printings"),
        yarn(["start"], path.join(root, "analysis"), "start"),
        yarn(["validate:refresh"], path.join(root, "analysis"), "validate"),
        yarn(["refresh:outputs", "classify"], path.join(root, "analysis"), "classify"),
        yarn(["publish:premium", "--dry-run"], path.join(root, "analysis"), "premium-dry"),
        yarn(["publish:premium"], path.join(root, "analysis"), "premium-publish"),
        yarn(["verify:premium"], path.join(root, "analysis"), "premium-verify"),
        yarn(["refresh:outputs", "stage"], path.join(root, "analysis"), "stage"),
        git(["commit", "-m", REFRESH_SUBJECT], "commit"),
        git(["push", "canonical", branch], "push"),
        make("gh", ["pr", "view", branch, "--json", "number", "--jq", ".number"], root, "pr-view"),
        make("gh", ["pr", "create", "--base", "main", "--head", branch, "--title", REFRESH_SUBJECT, "--body", "<pr-body>"], root, "pr-create"),
        make("gh", ["pr", "view", branch, "--json", "headRefOid,url"], root, "pr-readback"),
      ];
      for (const spec of planned) console.log(formatCommand(spec));
      return { status: "silent", step: "dry-run", command: "", firstErrorLines: [], headSha: "", logPath };
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
        if (download.status !== 0) failure("failed", "step 6", downloadCommand, [download.stderr]);
      } else {
        failure("failed", "step 6", downloadCommand, [firstOutput]);
      }
    }

    simple("step 7", yarn(["card-printings:generate"], scratchAnalysis, "printings"));
    simple("step 7", yarn(["start"], scratchAnalysis, "start"));
    simple("step 7", make(process.platform === "win32" ? "node.exe" : "node", ["scripts/build-deck-archive.mjs"], scratch, "archive"));
    simple("step 7", make(process.platform === "win32" ? "node.exe" : "node", ["scripts/generate-deck-hub-slugs.mjs"], scratch, "hubs"));
    simple("step 7", make(process.platform === "win32" ? "node.exe" : "node", ["scripts/generate-deck-redirects.mjs"], scratch, "redirects"));
    simple("step 7", yarn(["validate:refresh"], scratchAnalysis, "validate"));
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

    simple("step 10", yarn(["publish:premium", "--dry-run"], scratchAnalysis, "premium-dry"));
    simple("step 10", yarn(["publish:premium"], scratchAnalysis, "premium-publish"));
    simple("step 10", yarn(["verify:premium"], scratchAnalysis, "premium-verify"));
    simple("step 11", yarn(["refresh:outputs", "stage"], path.join(root, "analysis"), "stage"));
    simple("step 11", git(["commit", "-m", REFRESH_SUBJECT], "commit"));

    simple("step 12", git(["push", remote, branch], "push"));
    const localHead = simple("step 12", git(["rev-parse", "HEAD"], "head"));
    const headSha = localHead.stdout.trim();
    let values: PrBodyInput | undefined;
    try {
      values = readPrBodyValues(root);
    } catch (error) {
      failure("failed", "step 12", git(["rev-parse", "HEAD"], "head"), [String(error)]);
    }
    if (!values) failure("failed", "step 12", git(["rev-parse", "HEAD"], "head"), ["missing PR body values"]);
    const body = buildPrBody(values as PrBodyInput);
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
  const dryRun = process.argv.slice(2).includes("--dry-run");
  void runJob({ root: path.resolve(__dirname, "..", ".."), runner: defaultRunner, dryRun }).then((outcome) => {
    console.log(JSON.stringify(outcome));
    process.exitCode = outcome.status === "published" || outcome.status === "silent" ? 0 : outcome.status === "needs-person" ? 2 : 1;
  });
}
