import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import { CANONICAL_REPO, defaultRunner, runJob } from "../../scripts/refresh-job";
import type { CommandResult, CommandSpec, Runner } from "../../scripts/refresh-job";

interface GitResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

const git = (cwd: string, args: string[], env?: NodeJS.ProcessEnv): GitResult => {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, ...env } });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
};

const identity = {
  GIT_AUTHOR_NAME: "probe",
  GIT_AUTHOR_EMAIL: "probe@example.invalid",
  GIT_COMMITTER_NAME: "probe",
  GIT_COMMITTER_EMAIL: "probe@example.invalid",
};

interface Box {
  dir: string;
  local: string;
  remote: string;
  base: string;
  root: string;
  dispose: () => void;
}

const sandbox = (): Box => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "refresh-fetch-"));
  const remote = path.join(dir, "remote.git");
  const local = path.join(dir, "local");
  const root = path.join(dir, "job");
  git(dir, ["init", "-q", "--bare", "-b", "main", remote]);
  git(dir, ["clone", "-q", remote, local]);
  git(local, ["remote", "rename", "origin", "pocket"]);
  fs.writeFileSync(path.join(local, "f.txt"), "base\n");
  git(local, ["add", "f.txt"]);
  git(local, ["commit", "-q", "-m", "base"], identity);
  git(local, ["push", "-q", "pocket", "main"], identity);
  const base = git(local, ["rev-parse", "main"]).stdout.trim();
  fs.mkdirSync(root);
  fs.copyFileSync(path.resolve(__dirname, "../../../.nvmrc"), path.join(root, ".nvmrc"));
  return { dir, local, remote, base, root, dispose: () => fs.rmSync(dir, { recursive: true, force: true }) };
};

const diverge = (box: Box): string => {
  fs.writeFileSync(path.join(box.local, "local-only.txt"), "local\n");
  git(box.local, ["add", "local-only.txt"]);
  git(box.local, ["commit", "-q", "-m", "local"], identity);
  const localCommit = git(box.local, ["rev-parse", "main"]).stdout.trim();
  git(box.local, ["checkout", "-q", "-b", "topic"]);

  const peer = path.join(box.dir, "peer");
  git(box.dir, ["clone", "-q", box.remote, peer]);
  fs.writeFileSync(path.join(peer, "remote-only.txt"), "remote\n");
  git(peer, ["add", "remote-only.txt"]);
  git(peer, ["commit", "-q", "-m", "remote"], identity);
  git(peer, ["push", "-q", "origin", "main"], identity);
  git(box.local, ["config", "fetch.showForcedUpdates", "false"]);
  return localCommit;
};

const fallBehind = (box: Box): string => {
  git(box.local, ["checkout", "-q", "-b", "topic"]);
  git(box.local, ["branch", "-f", "main", box.base]);
  const peer = path.join(box.dir, "peer");
  git(box.dir, ["clone", "-q", box.remote, peer]);
  fs.writeFileSync(path.join(peer, "remote-only.txt"), "remote\n");
  git(peer, ["add", "remote-only.txt"]);
  git(peer, ["commit", "-q", "-m", "remote"], identity);
  git(peer, ["push", "-q", "origin", "main"], identity);
  const remoteTip = git(peer, ["rev-parse", "main"]).stdout.trim();
  git(box.local, ["config", "fetch.showForcedUpdates", "false"]);
  return remoteTip;
};

const mainHead = (box: Box): string => git(box.local, ["rev-parse", "main"]).stdout.trim();

const runWithRealFetch = async (box: Box): Promise<{
  outcome: Awaited<ReturnType<typeof runJob>>;
  calls: CommandSpec[];
  fetch: CommandResult | undefined;
}> => {
  const calls: CommandSpec[] = [];
  let fetch: CommandResult | undefined;
  const runner: Runner = (command) => {
    calls.push(command);
    const text = command.args.join(" ");
    if (text.includes("refs/heads/main:refs/heads/main")) {
      fetch = defaultRunner({ ...command, cwd: box.local, logPath: undefined });
      return fetch;
    }
    if (text.startsWith("fetch pocket automated/")) {
      return { status: 1, stdout: "", stderr: "fatal: Repository not found\n" };
    }
    if (text.startsWith("remote -v")) {
      return { status: 0, stdout: `pocket\thttps://github.com/${CANONICAL_REPO}.git (fetch)\n`, stderr: "" };
    }
    if (text.startsWith("rev-parse --abbrev-ref")) return { status: 0, stdout: "topic\n", stderr: "" };
    return { status: 0, stdout: "", stderr: "" };
  };
  const outcome = await runJob({ root: box.root, runner, date: "2026-11-23" });
  return { outcome, calls, fetch };
};

describe("main fetch with a forced-update config of false", () => {
  it("keeps a diverged main and stops as needs-person with the flag set", async () => {
    const box = sandbox();
    try {
      const localCommit = diverge(box);
      const { outcome, calls, fetch } = await runWithRealFetch(box);
      const fetchCall = calls.find((call) => call.args.includes("refs/heads/main:refs/heads/main"));
      expect(fetchCall?.args).toContain("--show-forced-updates");
      expect(fetch?.status).not.toBe(0);
      expect(`${fetch?.stdout}${fetch?.stderr}`).toContain("[rejected]");
      expect(`${fetch?.stdout}${fetch?.stderr}`).toContain("non-fast-forward");
      expect(mainHead(box)).toBe(localCommit);
      expect(outcome.status).toBe("needs-person");
      expect(outcome.step).toBe("step 1");
      expect(outcome.firstErrorLines.join(" ")).toContain("non-fast-forward");
    } finally {
      box.dispose();
    }
  });

  it("still fast-forwards main with the flag set", async () => {
    const box = sandbox();
    try {
      const remoteTip = fallBehind(box);
      const { outcome, fetch } = await runWithRealFetch(box);
      expect(fetch?.status).toBe(0);
      expect(mainHead(box)).toBe(remoteTip);
      expect(outcome.step).toBe("step 2");
    } finally {
      box.dispose();
    }
  });
});
