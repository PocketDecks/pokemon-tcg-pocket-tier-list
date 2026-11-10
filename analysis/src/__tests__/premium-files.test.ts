import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  assertVersionMatches,
  inspectMainPremiumVersion,
  loadPremiumFiles,
  readCommittedVersion,
  readPremiumVersionAtRef,
  readProjectId,
} from "../utils/premium-files";
import {
  PREMIUM_ARTEFACT_NAMES,
  premiumVersion,
  renderDataVersion,
} from "../utils/premium-artefacts";

const created: string[] = [];

const tmp = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "premium-files-"));
  created.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of created.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const writeAll = (dir: string): Record<string, string> => {
  const files = Object.fromEntries(PREMIUM_ARTEFACT_NAMES.map((name) => [name, `[${name.length}]`]));
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, `${name}.json`), content);
  }
  return files;
};

describe("loadPremiumFiles", () => {
  it("returns every artefact keyed by name", () => {
    const dir = tmp();
    const written = writeAll(dir);

    expect(loadPremiumFiles(dir)).toEqual(written);
  });

  it("names the missing artefact", () => {
    const dir = tmp();
    writeAll(dir);
    fs.rmSync(path.join(dir, "matchup-data-all.json"));

    expect(() => loadPremiumFiles(dir)).toThrow(/matchup-data-all\.json/);
  });

  it("ignores files that are not premium artefacts", () => {
    const dir = tmp();
    const written = writeAll(dir);
    fs.writeFileSync(path.join(dir, "notes.txt"), "x");

    expect(loadPremiumFiles(dir)).toEqual(written);
  });
});

describe("readCommittedVersion", () => {
  it("reads the premium version from the data version file", () => {
    const dir = tmp();
    const file = path.join(dir, "data-version.json");
    fs.writeFileSync(file, renderDataVersion("0123456789abcdef"));

    expect(readCommittedVersion(file)).toBe("0123456789abcdef");
  });

  it("rejects a file without a sixteen character hex version", () => {
    const dir = tmp();
    const file = path.join(dir, "data-version.json");
    fs.writeFileSync(file, '{ "premium": "nope" }\n');

    expect(() => readCommittedVersion(file)).toThrow(/premium/);
  });
});

describe("readPremiumVersionAtRef", () => {
  const makeRepo = (): { dir: string; git: (...args: string[]) => string } => {
    const dir = tmp();
    const git = (...args: string[]) => execFileSync(
      "git",
      ["-c", "user.name=test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...args],
      { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );
    git("init", "-q");
    git("remote", "add", "origin", "https://github.com/chase-mew/pokemon-tcg-pocket-tier-list.git");
    git("remote", "add", "pocketdecks", "https://github.com/PocketDecks/pokemon-tcg-pocket-tier-list.git");
    return { dir, git };
  };

  const commitVersion = (dir: string, git: (...args: string[]) => string, version: string): void => {
    fs.mkdirSync(path.join(dir, "public", "data"), { recursive: true });
    fs.writeFileSync(path.join(dir, "public", "data", "data-version.json"), renderDataVersion(version));
    git("add", "-A");
    git("commit", "-q", "-m", `version ${version}`);
  };

  it("uses the remote whose URL is the canonical repository", () => {
    const { dir, git } = makeRepo();
    commitVersion(dir, git, "aaaaaaaaaaaaaaaa");
    git("update-ref", "refs/remotes/origin/main", "HEAD");
    commitVersion(dir, git, "bbbbbbbbbbbbbbbb");
    git("update-ref", "refs/remotes/pocketdecks/main", "HEAD");

    expect(readPremiumVersionAtRef(dir)).toBe("bbbbbbbbbbbbbbbb");
    expect(readPremiumVersionAtRef(dir, "origin/main")).toBe("aaaaaaaaaaaaaaaa");
  });

  it("uses the canonical tracking ref when a local tag shadows main", () => {
    const { dir, git } = makeRepo();
    commitVersion(dir, git, "aaaaaaaaaaaaaaaa");
    git("update-ref", "refs/remotes/pocketdecks/main", "HEAD");
    commitVersion(dir, git, "bbbbbbbbbbbbbbbb");
    git("branch", "pocketdecks/main");

    expect(readPremiumVersionAtRef(dir)).toBe("aaaaaaaaaaaaaaaa");
    expect(readPremiumVersionAtRef(dir, "pocketdecks/main")).toBe("bbbbbbbbbbbbbbbb");
  });

  it("does not choose a canonical baseline when matching remote URLs are ambiguous", () => {
    const { dir, git } = makeRepo();
    commitVersion(dir, git, "aaaaaaaaaaaaaaaa");
    git("update-ref", "refs/remotes/origin/main", "HEAD");
    git("remote", "add", "upstream-copy", "https://github.com/PocketDecks/pokemon-tcg-pocket-tier-list.git");

    expect(readPremiumVersionAtRef(dir)).toBeUndefined();
  });
});

describe("inspectMainPremiumVersion", () => {
  const showVersion = (version: string | null) => {
    const content = version === null ? "{}" : renderDataVersion(version);
    return (args: string[], _cwd: string): string => {
      if (args[0] === "ls-tree") return "public/data/data-version.json\n";
      return content;
    };
  };
  const throwingGit = (): string => {
    throw new Error("exit status 128");
  };

  it("reports the committed version as found", () => {
    expect(
      inspectMainPremiumVersion("/repo", "refs/remotes/pocketdecks/main", showVersion("0123456789abcdef"))
    ).toEqual({ status: "found", version: "0123456789abcdef" });
  });

  it("reports an unreadable version when the committed file has no valid premium field", () => {
    expect(
      inspectMainPremiumVersion("/repo", "refs/remotes/pocketdecks/main", showVersion(null))
    ).toEqual({ status: "unreadable", reason: "public/data/data-version.json has no valid premium version" });
  });

  it("reports absent when the committed version file is missing", () => {
    const git = (args: string[]): string => args[0] === "ls-tree" ? "" : "{}";

    expect(inspectMainPremiumVersion("/repo", "refs/remotes/pocketdecks/main", git)).toEqual({ status: "absent" });
  });

  it("reports unreadable when git fails", () => {
    expect(
      inspectMainPremiumVersion("/repo", "refs/remotes/pocketdecks/main", throwingGit)
    ).toEqual({ status: "unreadable", reason: "exit status 128" });
  });

  it("reports absent when no canonical remote resolves", () => {
    expect(
      inspectMainPremiumVersion("/repo", undefined, showVersion("0123456789abcdef"))
    ).toEqual({ status: "absent" });
  });
});

describe("assertVersionMatches", () => {
  it("passes when the committed version matches the files", () => {
    const dir = tmp();
    const files = writeAll(dir);

    expect(() => assertVersionMatches(files, premiumVersion(files))).not.toThrow();
  });

  it("refuses when the files have moved on from the committed version", () => {
    const dir = tmp();
    const files = writeAll(dir);

    expect(() => assertVersionMatches(files, "0000000000000000")).toThrow(
      /0000000000000000.*refresh/
    );
  });
});

describe("readProjectId", () => {
  it("reads the default project from the firebase configuration", () => {
    const dir = tmp();
    const file = path.join(dir, ".firebaserc");
    fs.writeFileSync(file, JSON.stringify({ projects: { default: "my-project" } }));

    expect(readProjectId(file)).toBe("my-project");
  });

  it("throws when there is no default project", () => {
    const dir = tmp();
    const file = path.join(dir, ".firebaserc");
    fs.writeFileSync(file, JSON.stringify({ projects: {} }));

    expect(() => readProjectId(file)).toThrow(/default/);
  });
});
