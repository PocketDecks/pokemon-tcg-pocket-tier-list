import { describe, expect, it, vi } from "vitest";

import { runValidateRefreshCli } from "../../scripts/validate-refresh";
import type { PremiumGitRunner } from "../utils/premium-files";
import type { RefreshReport, validateRefresh } from "../utils/validate-refresh";

const CANONICAL_URL = "https://github.com/PocketDecks/pokemon-tcg-pocket-tier-list.git\n";

const gitWith = (versionFile: string | null): PremiumGitRunner => (args) => {
  if (args[0] === "remote" && args.length === 1) return "pocketdecks\n";
  if (args[0] === "remote" && args[1] === "get-url") return CANONICAL_URL;
  if (args[0] === "ls-tree") return versionFile === null ? "" : "public/data/data-version.json\n";
  if (args[0] === "show" && args[1].endsWith("data-version.json")) return versionFile ?? "";
  throw new Error(`unexpected git call: ${args.join(" ")}`);
};

const report = (overrides: Partial<RefreshReport> = {}): RefreshReport => ({
  windows: [{ window: "10d", archetypes: 12, floor: 10, previous: null }],
  notCompared: [],
  union: 12,
  images: 12,
  missingImages: [],
  orphanImages: [],
  failures: [],
  ...overrides,
});

const stub = (overrides: Partial<RefreshReport> = {}) =>
  vi.fn<(...args: Parameters<typeof validateRefresh>) => RefreshReport>(() => report(overrides));

const run = (args: string[], overrides: Parameters<typeof runValidateRefreshCli>[0] = {}) => {
  const logs: string[] = [];
  const errors: string[] = [];
  const validate = stub();
  const code = runValidateRefreshCli({
    args,
    repoRoot: "/repo",
    git: gitWith('{ "premium": "0123456789abcdef" }'),
    validate,
    log: (line) => logs.push(line),
    reportError: (line) => errors.push(line),
    ...overrides,
  });
  return { code, logs, errors, validate };
};

describe("validate:refresh entry point", () => {
  it("refuses an unreadable canonical main version and says how to continue", () => {
    const { code, errors, validate } = run([], { git: gitWith("{") });

    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("refusing to validate against an unreadable baseline");
    expect(errors.join("\n")).toContain("--previous <dir> or --no-previous");
    expect(errors.join("\n")).toContain("repair public/data/data-version.json on main");
    expect(validate).not.toHaveBeenCalled();
  });

  it("refuses a version file with no valid premium version", () => {
    const { code, errors, validate } = run([], { git: gitWith('{ "premium": "deadbeef" }') });

    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("refusing to validate against an unreadable baseline");
    expect(validate).not.toHaveBeenCalled();
  });

  it("stops when no remote points at the canonical repository", () => {
    const git: PremiumGitRunner = (args) => (args.length === 1 && args[0] === "remote" ? "" : "");
    const { code, errors, validate } = run([], { git });

    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("cannot resolve the canonical main remote; pass --previous-ref <ref>");
    expect(validate).not.toHaveBeenCalled();
  });

  it("compares against nothing when asked not to", () => {
    const { code, validate } = run(["--no-previous"], { git: gitWith("{") });

    expect(code).toBe(0);
    expect(validate).toHaveBeenCalledTimes(1);
    expect(validate.mock.calls[0][2]).toBeNull();
  });

  it("compares against the directory it is given", () => {
    const { code, validate } = run(["--previous", "/baseline", "--data", "/data", "--images", "/images"], {
      git: gitWith("{"),
    });

    expect(code).toBe(0);
    expect(validate.mock.calls[0].slice(0, 3)).toEqual(["/data", "/images", "/baseline"]);
  });

  it("rejects a flag that has no value", () => {
    const { code, errors, validate } = run(["--data"]);

    expect(code).toBe(1);
    expect(errors).toEqual(["--data needs a value"]);
    expect(validate).not.toHaveBeenCalled();
  });

  it("prints the report and returns zero when every window clears its floor", () => {
    const { code, logs, errors } = run(["--no-previous"]);

    expect(code).toBe(0);
    expect(errors).toEqual([]);
    expect(logs).toContain("10d: 12 archetypes, floor 10, no previous");
    expect(logs).toContain("union: 12 deck names, 12 OG images, 0 missing, 0 orphan");
  });

  it("prints each failure and returns non-zero", () => {
    const validate = stub({ failures: ["10d: 3 archetypes, floor 10", "best-decks.json is missing"] });
    const { code, errors } = run(["--no-previous"], { validate });

    expect(code).toBe(1);
    expect(errors).toEqual(["10d: 3 archetypes, floor 10", "best-decks.json is missing"]);
  });

  it("says which windows were not compared", () => {
    const validate = stub({ notCompared: ["30d", "all"] });
    const { logs } = run(["--no-previous"], { validate });

    expect(logs).toContain("no previous publish for 30d, all; their thinner-than-last-time floors were skipped");
  });
});
