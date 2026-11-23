import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultRunner, isMissingRemoteBranch } from "../../scripts/refresh-job";
import type { CommandSpec } from "../../scripts/refresh-job";

const git = (cwd: string, args: string[], env?: NodeJS.ProcessEnv): string => {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, ...env } });
  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
};

const sandbox = (): { dir: string; local: string; dispose: () => void } => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "refresh-locale-"));
  const remote = path.join(dir, "remote.git");
  const local = path.join(dir, "local");
  const identity = {
    GIT_AUTHOR_NAME: "probe",
    GIT_AUTHOR_EMAIL: "probe@example.invalid",
    GIT_COMMITTER_NAME: "probe",
    GIT_COMMITTER_EMAIL: "probe@example.invalid",
  };
  git(dir, ["init", "-q", "--bare", "-b", "main", remote]);
  git(dir, ["clone", "-q", remote, local]);
  fs.writeFileSync(path.join(local, "f.txt"), "base\n");
  git(local, ["add", "f.txt"]);
  git(local, ["commit", "-q", "-m", "base"], identity);
  git(local, ["push", "-q", "origin", "main"], identity);
  return { dir, local, dispose: () => fs.rmSync(dir, { recursive: true, force: true }) };
};

const probeGerman = (): boolean => {
  // Forces the German case off to mirror a runner without that locale.
  if (process.env.REFRESH_SKIP_GERMAN_PROBE) return false;
  const box = sandbox();
  try {
    return git(box.local, ["fetch", "origin", "refs/heads/nope"], {
      LANGUAGE: "de",
      LC_ALL: "de_DE.UTF-8",
    }).includes("Konnte Remote-Referenz");
  } finally {
    box.dispose();
  }
};

const germanAvailable = probeGerman();

const stubCode =
  'const english = process.env.LC_ALL === "C" && !process.env.LANGUAGE; ' +
  'console.log(english ? "fatal: couldn\'t find remote ref refs/heads/nope" : "Konnte Remote-Referenz refs/heads/nope");';

describe("git locale", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("runs git under the C locale and matches the English refusal", () => {
    const box = sandbox();
    try {
      vi.stubEnv("LANGUAGE", "de");
      vi.stubEnv("LC_ALL", "de_DE.UTF-8");
      const spec: CommandSpec = {
        file: "git",
        args: ["fetch", "origin", "refs/heads/nope"],
        cwd: box.local,
        env: { LC_ALL: "C", LANGUAGE: "" },
      };
      const result = defaultRunner(spec);
      expect(result.stderr).toContain("couldn't find remote ref");
      expect(isMissingRemoteBranch(result.stderr)).toBe(true);

      const overridden = defaultRunner({
        file: process.execPath,
        args: ["-e", stubCode],
        env: { LC_ALL: "C", LANGUAGE: "" },
      });
      const inherited = defaultRunner({ file: process.execPath, args: ["-e", stubCode] });
      expect(inherited.stdout).toContain("Konnte Remote-Referenz");
      expect(overridden.stdout).toContain("couldn't find remote ref");
    } finally {
      box.dispose();
    }
  });

  it.runIf(germanAvailable)("does not match the translated refusal when German is installed", () => {
    const box = sandbox();
    try {
      const german = git(box.local, ["fetch", "origin", "refs/heads/nope"], {
        LANGUAGE: "de",
        LC_ALL: "de_DE.UTF-8",
      });
      expect(german).toContain("Konnte Remote-Referenz");
      expect(isMissingRemoteBranch(german)).toBe(false);
    } finally {
      box.dispose();
    }
  });
});
