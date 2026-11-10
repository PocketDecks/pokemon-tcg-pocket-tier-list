import { execFileSync } from "node:child_process";
import fs from "node:fs";

import {
  PREMIUM_ARTEFACT_NAMES,
  premiumFilePath,
  premiumVersion,
} from "./premium-artefacts";

export const CANONICAL_PREMIUM_REPOSITORY = "PocketDecks/pokemon-tcg-pocket-tier-list";

export type PremiumGitRunner = (args: string[], cwd: string) => string;

export const defaultGitRunner: PremiumGitRunner = (args, cwd) => execFileSync("git", args, {
  cwd,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
  timeout: 60_000,
});

const VERSION_FILE = "public/data/data-version.json";

const repositoryOf = (remoteUrl: string): string | undefined => {
  const value = remoteUrl.trim();
  const scp = /^git@github\.com:(.+)$/i.exec(value);
  let pathname: string;
  if (scp) {
    pathname = scp[1];
  } else {
    try {
      const url = new URL(value);
      if (url.hostname.toLowerCase() !== "github.com" || !["https:", "ssh:", "git:"].includes(url.protocol)) {
        return undefined;
      }
      pathname = url.pathname;
    } catch {
      return undefined;
    }
  }
  return pathname.replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "").toLowerCase();
};

export const resolveCanonicalMainRef = (
  repoRoot: string,
  git: PremiumGitRunner = defaultGitRunner
): string | undefined => {
  try {
    const remotes = git(["remote"], repoRoot).split(/\r?\n/).filter(Boolean);
    const matches = remotes.filter((remote) => {
      const urls = git(["remote", "get-url", remote], repoRoot).trim().split(/\r?\n/);
      return urls.length === 1 && repositoryOf(urls[0]) === CANONICAL_PREMIUM_REPOSITORY.toLowerCase();
    });
    return matches.length === 1 ? `refs/remotes/${matches[0]}/main` : undefined;
  } catch {
    return undefined;
  }
};

export const loadPremiumFiles = (dir: string): Record<string, string> => {
  const files: Record<string, string> = {};
  for (const name of PREMIUM_ARTEFACT_NAMES) {
    const file = premiumFilePath(name, dir);
    if (!fs.existsSync(file)) throw new Error(`missing ${file}`);
    files[name] = fs.readFileSync(file, "utf8");
  }
  return files;
};

export const premiumVersionOf = (parsed: unknown): string | undefined => {
  const value = (parsed as { premium?: unknown } | null)?.premium;
  return typeof value === "string" && /^[0-9a-f]{16}$/.test(value) ? value : undefined;
};

export const readCommittedVersion = (file: string): string => {
  const version = premiumVersionOf(JSON.parse(fs.readFileSync(file, "utf8")));
  if (version === undefined) throw new Error(`${file} has no valid premium version`);
  return version;
};

export type MainPremiumVersionStatus =
  | { status: "found"; version: string }
  | { status: "absent" }
  | { status: "unreadable"; reason: string };

export const inspectPremiumVersionAtRef = (
  repoRoot: string,
  ref: string,
  git: PremiumGitRunner = defaultGitRunner
): MainPremiumVersionStatus => {
  const paths = git(["ls-tree", "-r", "--name-only", ref, "--", VERSION_FILE], repoRoot)
    .split(/\r?\n/)
    .filter(Boolean);
  if (!paths.includes(VERSION_FILE)) return { status: "absent" };

  const output = git(["show", `${ref}:${VERSION_FILE}`], repoRoot);
  try {
    const version = premiumVersionOf(JSON.parse(output));
    return version
      ? { status: "found", version }
      : { status: "unreadable", reason: `${VERSION_FILE} has no valid premium version` };
  } catch (error) {
    return { status: "unreadable", reason: (error as Error).message };
  }
};

export const inspectMainPremiumVersion = (
  repoRoot: string,
  ref?: string,
  git: PremiumGitRunner = defaultGitRunner
): MainPremiumVersionStatus => {
  const targetRef = ref ?? resolveCanonicalMainRef(repoRoot, git);
  if (!targetRef) return { status: "absent" };
  try {
    return inspectPremiumVersionAtRef(repoRoot, targetRef, git);
  } catch (error) {
    return { status: "unreadable", reason: (error as Error).message };
  }
};

export const readPremiumVersionAtRef = (
  repoRoot: string,
  ref?: string,
  git: PremiumGitRunner = defaultGitRunner
): string | undefined => {
  const status = inspectMainPremiumVersion(repoRoot, ref, git);
  return status.status === "found" ? status.version : undefined;
};

export const assertVersionMatches = (
  files: Record<string, string>,
  committed: string
): void => {
  const actual = premiumVersion(files);
  if (actual !== committed) {
    throw new Error(
      `the premium files hash to ${actual} but data-version.json says ${committed}; ` +
        "run the refresh again so the committed version matches"
    );
  }
};

export const readProjectId = (file: string): string => {
  const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
  const value = (parsed as { projects?: { default?: unknown } } | null)?.projects?.default;
  if (typeof value !== "string" || value === "") {
    throw new Error(`${file} has no default project`);
  }
  return value;
};
