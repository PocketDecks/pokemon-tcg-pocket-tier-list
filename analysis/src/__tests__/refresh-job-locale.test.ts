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

describe("git locale", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("matches a missing-ref refusal under a German parent locale", () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "refresh-locale-"));
    try {
      const remote = path.join(temp, "remote.git");
      const local = path.join(temp, "local");
      const identity = {
        GIT_AUTHOR_NAME: "probe",
        GIT_AUTHOR_EMAIL: "probe@example.invalid",
        GIT_COMMITTER_NAME: "probe",
        GIT_COMMITTER_EMAIL: "probe@example.invalid",
      };
      git(temp, ["init", "-q", "--bare", "-b", "main", remote]);
      git(temp, ["clone", "-q", remote, local]);
      fs.writeFileSync(path.join(local, "f.txt"), "base\n");
      git(local, ["add", "f.txt"]);
      git(local, ["commit", "-q", "-m", "base"], identity);
      git(local, ["push", "-q", "origin", "main"], identity);

      const german = git(local, ["fetch", "origin", "refs/heads/nope"], {
        LANGUAGE: "de",
        LC_ALL: "de_DE.UTF-8",
      });
      expect(german).toContain("Konnte Remote-Referenz");
      expect(isMissingRemoteBranch(german)).toBe(false);

      vi.stubEnv("LANGUAGE", "de");
      vi.stubEnv("LC_ALL", "de_DE.UTF-8");
      const spec: CommandSpec = {
        file: "git",
        args: ["fetch", "origin", "refs/heads/nope"],
        cwd: local,
        env: { LC_ALL: "C", LANGUAGE: "" },
      };
      const result = defaultRunner(spec);
      expect(result.stderr).toContain("couldn't find remote ref");
      expect(isMissingRemoteBranch(result.stderr)).toBe(true);
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });
});
