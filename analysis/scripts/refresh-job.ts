import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export type JobStatus = "published" | "silent" | "needs-person" | "failed";

export interface CommandSpec {
  file: string;
  args: string[];
  cwd?: string;
}

export interface CommandResult {
  status: number;
  stdout: string;
  stderr: string;
}

export type Runner = (command: CommandSpec) => CommandResult;

export interface JobOutcome {
  status: JobStatus;
  step: string;
  command: string;
  firstErrorLines: string[];
  prUrl: string;
  headSha: string;
}

export interface PrBodyInput {
  pairingRows: number;
  rankedArchetypes: number;
  imageParity: string;
  testResults: string;
  premiumVersion: string;
}

export const CANONICAL_REPO = "PocketDecks/pokemon-tcg-pocket-tier-list";
export const AUTOMATION_AUTHOR = "github-actions[bot]";
export const REFRESH_SUBJECT = "chore(data): refresh tier-list snapshot";

export const defaultRunner: Runner = ({ file, args, cwd }) => {
  const result = spawnSync(file, args, { cwd, encoding: "utf8" });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
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
    if (
      url.includes(`${CANONICAL_REPO}.git`) ||
      url.includes(`${CANONICAL_REPO}/`) ||
      url.endsWith(CANONICAL_REPO) ||
      url.endsWith(`${CANONICAL_REPO}.git`)
    ) {
      return match[1];
    }
  }
  return null;
};

export const humanCommits = (log: string): string[] =>
  log
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .filter((line) => {
      const match = line.match(/^([0-9a-f]+)\s+(.+?)\s+(.+)$/);
      if (!match) return true;
      return !(match[2] === AUTOMATION_AUTHOR && match[3] === REFRESH_SUBJECT);
    });

export const isSilentDay = (classifyOutput: string): boolean =>
  classifyOutput.trim().length === 0;

export const buildPrBody = (input: PrBodyInput): string =>
  [
    "Pairing rows: " + input.pairingRows,
    "Ranked archetypes: " + input.rankedArchetypes,
    "Image parity: " + input.imageParity,
    "Test results: " + input.testResults,
    "Premium version: " + input.premiumVersion,
  ].join("\n");

export const needsPersonForRefusal = (output: string): boolean => {
  const text = output.toLowerCase();
  return (
    text.includes("remove the lock") ||
    text.includes("remove the claim") ||
    text.includes("repair the raw store") ||
    text.includes("pid has been reused")
  );
};

export const storeLockRetry = (output: string): boolean => {
  const text = output.toLowerCase();
  return text.includes("retry") && (text.includes("lock") || text.includes("claim"));
};

export const thrownDownloadError = (output: string): boolean =>
  /thrown|error:|exception/i.test(output);

export const interruptedBatch = (output: string): boolean =>
  /already exists in shard|interrupted processed-tournaments|staging sidecar/i.test(output);

export const readPremiumVersion = (root: string): string => {
  const file = path.join(root, "public", "data", "data-version.json");
  const value = JSON.parse(fs.readFileSync(file, "utf8")) as { premium?: string };
  if (!value.premium) throw new Error(`${file} has no premium version`);
  return value.premium;
};

export const copyRawStore = (root: string, date: string): string => {
  const target = path.join(root, "analysis", "data-backup", date);
  fs.cpSync(path.join(root, "analysis", "data"), target, { recursive: true });
  return target;
};

const yarnCommand = (args: string[], cwd?: string): CommandSpec => ({
  file: process.platform === "win32" ? "yarn.cmd" : "yarn",
  args,
  cwd,
});

const gitCommand = (args: string[], cwd?: string): CommandSpec => ({
  file: "git",
  args,
  cwd,
});

const nodeCommand = (script: string, cwd?: string): CommandSpec => ({
  file: process.platform === "win32" ? "node.exe" : "node",
  args: [script],
  cwd,
});

const firstErrorLines = (result: CommandResult): string[] =>
  [result.stderr, result.stdout]
    .join("\n")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 5);

class JobStop extends Error {
  outcome: JobOutcome;

  constructor(outcome: JobOutcome) {
    super(outcome.step);
    this.outcome = outcome;
  }
}

export const plannedCommands = (root: string, date: string, remote: string, branch: string): CommandSpec[] => {
  const analysis = path.join(root, "analysis");
  return [
    gitCommand(["status", "--short"], root),
    gitCommand(["remote", "-v"], root),
    gitCommand(["pull", "--ff-only", remote, "main"], root),
    gitCommand(["checkout", "-b", branch, "main"], root),
    yarnCommand(["refresh:outputs", "begin"], analysis),
    yarnCommand(["sync-pairings"], analysis),
    yarnCommand(["golden:generate"], analysis),
    yarnCommand(["store:verify"], analysis),
    yarnCommand(["download"], analysis),
    yarnCommand(["download"], analysis),
    yarnCommand(["card-printings:generate"], analysis),
    yarnCommand(["start"], analysis),
    nodeCommand("scripts/build-deck-archive.mjs", root),
    nodeCommand("scripts/generate-deck-hub-slugs.mjs", root),
    nodeCommand("scripts/generate-deck-redirects.mjs", root),
    yarnCommand(["validate:refresh"], analysis),
    yarnCommand(["test"], analysis),
    yarnCommand(["typecheck"], analysis),
    yarnCommand(["typecheck"], root),
    yarnCommand(["lint"], root),
    yarnCommand(["test:ci"], root),
    yarnCommand(["check:generated"], root),
    yarnCommand(["refresh:outputs", "classify"], analysis),
    yarnCommand(["publish:premium", "--dry-run"], analysis),
    yarnCommand(["publish:premium"], analysis),
    yarnCommand(["verify:premium"], analysis),
    yarnCommand(["refresh:outputs", "stage"], analysis),
    gitCommand(["commit", "-m", REFRESH_SUBJECT], root),
    gitCommand(["push", remote, branch], root),
    gitCommand(["rev-parse", "HEAD"], root),
    {
      file: "gh",
      args: ["pr", "create", "--base", "main", "--head", branch, "--title", REFRESH_SUBJECT, "--body", "<pr-body>"],
      cwd: root,
    },
    {
      file: "gh",
      args: ["pr", "view", branch, "--json", "headRefOid,url"],
      cwd: root,
    },
  ];
};

export interface JobOptions {
  root: string;
  runner: Runner;
  date?: string;
  dryRun?: boolean;
}

export const runJob = (options: JobOptions): JobOutcome => {
  const root = options.root;
  const date = options.date ?? new Date().toISOString().slice(0, 10);
  const branch = `automated/pipeline-update-${date}`;
  const analysis = path.join(root, "analysis");
  const runner = options.runner;
  let lastStep = "start";
  let lastCommand = "";

  if (options.dryRun) {
    for (const command of plannedCommands(root, date, "canonical", branch)) {
      console.log(formatCommand(command));
    }
    return { status: "silent", step: "dry-run", command: "", firstErrorLines: [], prUrl: "", headSha: "" };
  }

  const fail = (step: string, command: CommandSpec, result: CommandResult, status: JobStatus = "failed"): never => {
    throw new JobStop({
      status,
      step,
      command: formatCommand(command),
      firstErrorLines: firstErrorLines(result),
      prUrl: "",
      headSha: "",
    });
  };

  try {
    const status = runner(gitCommand(["status", "--short"], root));
    if (status.status !== 0) fail("step 1", gitCommand(["status", "--short"], root), status);
    if (status.stdout.trim().length > 0) {
      throw new JobStop({
        status: "needs-person",
        step: "step 1",
        command: formatCommand(gitCommand(["status", "--short"], root)),
        firstErrorLines: status.stdout.trim().split(/\r?\n/).slice(0, 5),
        prUrl: "",
        headSha: "",
      });
    }

    const remotes = runner(gitCommand(["remote", "-v"], root));
    if (remotes.status !== 0) fail("step 1", gitCommand(["remote", "-v"], root), remotes);
    const remote = findCanonicalRemote(remotes.stdout);
    if (!remote) {
      throw new JobStop({
        status: "needs-person",
        step: "step 1",
        command: formatCommand(gitCommand(["remote", "-v"], root)),
        firstErrorLines: [CANONICAL_REPO],
        prUrl: "",
        headSha: "",
      });
    }

    const pull = runner(gitCommand(["pull", "--ff-only", remote, "main"], root));
    if (pull.status !== 0) fail("step 1", gitCommand(["pull", "--ff-only", remote, "main"], root), pull);

    const localLog = runner(gitCommand(["log", "--format=%h %an %s", `main..${branch}`], root));
    const remoteLog = runner(gitCommand(["log", "--format=%h %an %s", `main..refs/remotes/${remote}/${branch}`], root));
    const humans = [
      ...humanCommits(localLog.stdout),
      ...humanCommits(remoteLog.stdout),
    ];
    if (humans.length > 0) {
      throw new JobStop({
        status: "needs-person",
        step: "step 2",
        command: formatCommand(gitCommand(["log", "--format=%h %an %s", `main..${branch}`], root)),
        firstErrorLines: humans.slice(0, 5),
        prUrl: "",
        headSha: "",
      });
    }
    const branchCheckout = runner(gitCommand(["checkout", "-b", branch, "main"], root));
    if (branchCheckout.status !== 0 && !/already exists/i.test(branchCheckout.stderr)) {
      fail("step 2", gitCommand(["checkout", "-b", branch, "main"], root), branchCheckout);
    }

    const simple = (step: string, command: CommandSpec): void => {
      lastStep = step;
      lastCommand = formatCommand(command);
      const result = runner(command);
      if (result.status !== 0) fail(step, command, result);
    };

    simple("step 3", yarnCommand(["refresh:outputs", "begin"], analysis));
    simple("step 3", yarnCommand(["sync-pairings"], analysis));
    simple("step 4", yarnCommand(["golden:generate"], analysis));

    const verifyCommand = yarnCommand(["store:verify"], analysis);
    lastStep = "step 5";
    lastCommand = formatCommand(verifyCommand);
    const verify = runner(verifyCommand);
    if (verify.status !== 0) {
      const backup = copyRawStore(root, date);
      throw new JobStop({
        status: "needs-person",
        step: "step 5",
        command: lastCommand,
        firstErrorLines: [backup, ...firstErrorLines(verify)],
        prUrl: "",
        headSha: "",
      });
    }

    const downloadCommand = yarnCommand(["download"], analysis);
    let download = runner(downloadCommand);
    if (download.status !== 0) {
      const output = `${download.stdout}\n${download.stderr}`;
      if (interruptedBatch(output) || needsPersonForRefusal(output)) {
        copyRawStore(root, date);
        throw new JobStop({
          status: "needs-person",
          step: "step 6",
          command: formatCommand(downloadCommand),
          firstErrorLines: firstErrorLines(download),
          prUrl: "",
          headSha: "",
        });
      }
      if (thrownDownloadError(output) || storeLockRetry(output)) {
        download = runner(downloadCommand);
      }
      if (download.status !== 0) fail("step 6", downloadCommand, download);
    }

    simple("step 7", yarnCommand(["card-printings:generate"], analysis));
    simple("step 7", yarnCommand(["start"], analysis));
    simple("step 7", nodeCommand("scripts/build-deck-archive.mjs", root));
    simple("step 7", nodeCommand("scripts/generate-deck-hub-slugs.mjs", root));
    simple("step 7", nodeCommand("scripts/generate-deck-redirects.mjs", root));
    simple("step 7", yarnCommand(["validate:refresh"], analysis));
    simple("step 8", yarnCommand(["test"], analysis));
    simple("step 8", yarnCommand(["typecheck"], analysis));
    simple("step 8", yarnCommand(["typecheck"], root));
    simple("step 8", yarnCommand(["lint"], root));
    simple("step 8", yarnCommand(["test:ci"], root));
    simple("step 8", yarnCommand(["check:generated"], root));

    const classifyCommand = yarnCommand(["refresh:outputs", "classify"], analysis);
    const classify = runner(classifyCommand);
    if (classify.status !== 0) fail("step 9", classifyCommand, classify);
    if (isSilentDay(classify.stdout)) {
      simple("step 9", yarnCommand(["refresh:outputs", "discard"], analysis));
      return { status: "silent", step: "step 9", command: formatCommand(classifyCommand), firstErrorLines: [], prUrl: "", headSha: "" };
    }

    simple("step 10", yarnCommand(["publish:premium", "--dry-run"], analysis));
    simple("step 10", yarnCommand(["publish:premium"], analysis));
    simple("step 10", yarnCommand(["verify:premium"], analysis));
    simple("step 11", yarnCommand(["refresh:outputs", "stage"], analysis));
    simple("step 11", gitCommand(["commit", "-m", REFRESH_SUBJECT], root));

    const pushCommand = gitCommand(["push", remote, branch], root);
    const push = runner(pushCommand);
    if (push.status !== 0) fail("step 12", pushCommand, push);

    const localHead = runner(gitCommand(["rev-parse", "HEAD"], root));
    if (localHead.status !== 0) fail("step 12", gitCommand(["rev-parse", "HEAD"], root), localHead);
    const headSha = localHead.stdout.trim();
    const premiumVersion = readPremiumVersion(root);
    const body = buildPrBody({
      pairingRows: 0,
      rankedArchetypes: 0,
      imageParity: "checked",
      testResults: "passed",
      premiumVersion,
    });
    const prCommand: CommandSpec = {
      file: "gh",
      args: ["pr", "create", "--base", "main", "--head", branch, "--title", REFRESH_SUBJECT, "--body", body],
      cwd: root,
    };
    const pr = runner(prCommand);
    if (pr.status !== 0) fail("step 12", prCommand, pr);
    const prUrl = pr.stdout.trim();

    const readBack = runner({
      file: "gh",
      args: ["pr", "view", branch, "--json", "headRefOid,url"],
      cwd: root,
    });
    if (readBack.status !== 0) fail("step 13", { file: "gh", args: ["pr", "view", branch] }, readBack);
    const parsed = JSON.parse(readBack.stdout) as { headRefOid: string; url: string };
    if (parsed.headRefOid !== headSha) {
      throw new JobStop({
        status: "failed",
        step: "step 13",
        command: formatCommand({ file: "gh", args: ["pr", "view", branch, "--json", "headRefOid,url"] }),
        firstErrorLines: [headSha, parsed.headRefOid],
        prUrl: parsed.url,
        headSha,
      });
    }
    return { status: "published", step: "step 13", command: "", firstErrorLines: [], prUrl: parsed.url, headSha };
  } catch (error) {
    if (error instanceof JobStop) return error.outcome;
    return {
      status: "failed",
      step: lastStep,
      command: lastCommand,
      firstErrorLines: [String(error)],
      prUrl: "",
      headSha: "",
    };
  }
};

const invokedDirectly = process.argv[1] ? path.resolve(process.argv[1]) === __filename : false;

if (invokedDirectly) {
  const dryRun = process.argv.slice(2).includes("--dry-run");
  const outcome = runJob({ root: path.resolve(__dirname, "..", ".."), runner: defaultRunner, dryRun });
  console.log(JSON.stringify(outcome));
  process.exitCode = outcome.status === "published" || outcome.status === "silent" ? 0 : outcome.status === "needs-person" ? 2 : 1;
}
