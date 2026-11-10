import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { Timestamp } from "firebase-admin/firestore";

import { discoverPremiumRetentionSources as discover, publishPremium } from "../../scripts/publish-premium";
import { PREMIUM_ARTEFACT_NAMES, premiumVersion } from "../utils/premium-artefacts";
import type { PremiumGitRunner } from "../utils/premium-files";

process.env.GITHUB_TOKEN = "dummy-test-token";

const canonicalRepository = "PocketDecks/pokemon-tcg-pocket-tier-list";
const apiRoot = `https://api.github.com/repos/${canonicalRepository}/pulls`;
const pageTwo = `${apiRoot}?state=open&base=main&per_page=100&page=2`;
const numericPageTwo = `https://api.github.com/repositories/12345/pulls?state=open&base=main&per_page=100&page=2`;
const versions = {
  canonical: "aaaaaaaaaaaaaaaa",
  deployed: "bbbbbbbbbbbbbbbb",
  firstHead: "cccccccccccccccc",
  secondHead: "dddddddddddddddd",
};

const response = (
  body: unknown,
  status = 200,
  link: string | null = null
): Response => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers(link ? { Link: link } : undefined),
  json: async () => body,
} as Response);

const pull = (
  headRepository: string,
  headSha: string,
  baseRepository = canonicalRepository,
  baseRef = "main",
  state = "open"
) => ({
  state,
  base: { ref: baseRef, repo: { full_name: baseRepository } },
  head: { sha: headSha, repo: { full_name: headRepository } },
});

const apiVersionFile = (version: string): unknown => ({
  encoding: "base64",
  content: Buffer.from(`{ "premium": "${version}" }\n`, "utf8").toString("base64"),
});

const fakeGit = (
  canonicalVersion = versions.canonical,
  { ambiguous = false, failFetch = false, noCanonical = false, automatedBranch = undefined as string | undefined }: { ambiguous?: boolean; failFetch?: boolean; noCanonical?: boolean; automatedBranch?: string } = {}
): PremiumGitRunner => (args) => {
  if (args[0] === "remote" && args.length === 1) {
    if (noCanonical) return "origin\n";
    return ambiguous ? "origin\npocketdecks\nupstream-copy\n" : "origin\npocketdecks\n";
  }
  if (args[0] === "remote" && args[1] === "get-url") {
    return args[2] === "origin"
      ? "https://github.com/chase-mew/pokemon-tcg-pocket-tier-list.git\n"
      : "https://github.com/PocketDecks/pokemon-tcg-pocket-tier-list.git\n";
  }
  if (args[0] === "fetch") {
    if (failFetch) throw new Error("fetch failed");
    return "";
  }
  if (args[0] === "for-each-ref") {
    return automatedBranch ? "refs/remotes/pocketdecks/automated/a/b\n" : "";
  }
  if (args[0] === "ls-tree") {
    return args.includes("refs/remotes/pocketdecks/main") || args.some((arg) => arg.includes("automated/"))
      ? "public/data/data-version.json\n"
      : "";
  }
  if (args[0] === "show" && args[1] === "refs/remotes/pocketdecks/main:public/data/data-version.json") {
    return `{ "premium": "${canonicalVersion}" }\n`;
  }
  if (args[0] === "show" && args[1]?.includes("automated/") && args[1].endsWith(":public/data/data-version.json")) {
    return `{ "premium": "${automatedBranch}" }\n`;
  }
  throw new Error(`unexpected git call: ${args.join(" ")}`);
};

const automatedBranchesGit = (branches: Record<string, string>): PremiumGitRunner => {
  const base = fakeGit();
  const versionFile = ":public/data/data-version.json";
  return (args, cwd) => {
    if (args[0] === "for-each-ref") return Object.keys(branches).map((ref) => `${ref}\n`).join("");
    if (args[0] === "ls-tree" && branches[args[3]] !== undefined) return "public/data/data-version.json\n";
    if (args[0] === "show" && args[1].endsWith(versionFile)) {
      const branch = branches[args[1].slice(0, -versionFile.length)];
      if (branch !== undefined) return branch;
    }
    return base(args, cwd);
  };
};

const pullPages = () => [
  pull("contributor/refresh", "1".repeat(40)),
  pull("contributor/other-branch", "2".repeat(40), canonicalRepository, "release"),
  pull("contributor/closed", "3".repeat(40), canonicalRepository, "main", "closed"),
  pull("contributor/wrong-base", "4".repeat(40), "someone/fork", "main"),
];

const successfulFetch = (calls: { url: string; auth: string | null; cacheControl: string | null }[], nextPage = pageTwo): typeof fetch => (async (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  calls.push({
    url: url.toString(),
    auth: new Headers(init?.headers).get("authorization"),
    cacheControl: new Headers(init?.headers).get("cache-control"),
  });
  if (url.origin === "https://pocketdecks.top") return response({ premium: versions.deployed });
  if (url.origin !== "https://api.github.com") throw new Error("unexpected host");
  if (url.pathname === `/repos/${canonicalRepository}/pulls` || /^\/repositories\/\d+\/pulls$/.test(url.pathname)) {
    if (url.searchParams.get("page") === "2" || url.pathname.startsWith("/repositories/")) return response([
      pull("another/fork", "5".repeat(40)),
    ]);
    return response(pullPages(), 200, `<${nextPage}>; rel = "next"`);
  }
  if (url.pathname.endsWith("/contents/public/data/data-version.json")) {
    const repo = url.pathname.split("/").slice(2, 4).join("/");
    return response(apiVersionFile(repo === "contributor/refresh" ? versions.firstHead : versions.secondHead));
  }
  throw new Error("unexpected API path");
}) as typeof fetch;

const noPruneDb = (writes: string[], deletes: string[]) => {
  let lock: Record<string, unknown> | undefined;
  return {
    collection: () => ({
      listDocuments: async () => Array.from({ length: 6 }, (_, index) => ({
        id: `old-${index}`,
        get: async () => ({ exists: true, get: () => Timestamp.fromMillis(index) }),
      })),
    }),
    doc: (docPath: string) => ({
      ref: { path: docPath },
      set: async () => {
        writes.push(docPath);
      },
    }),
    recursiveDelete: async (ref: { path: string }) => {
      deletes.push(ref.path);
    },
    runTransaction: async <T>(callback: (transaction: {
      get: (ref: unknown) => Promise<{ exists: boolean; get: (field: string) => unknown }>;
      create: (ref: unknown, data: Record<string, unknown>) => void;
      delete: (ref: unknown) => void;
    }) => Promise<T>): Promise<T> => callback({
      get: async () => ({ exists: lock !== undefined, get: (field) => lock?.[field] }),
      create: (_ref, data) => {
        lock = data;
      },
      delete: () => {
        lock = undefined;
      },
    }),
  };
};

const automatedBranchInspectionFailure = (): PremiumGitRunner => {
  const git = automatedBranchesGit({
    "refs/remotes/pocketdecks/automated/refresh": `{ "premium": "${versions.secondHead}" }\n`,
  });
  return (args, cwd) => {
    if (args[0] === "ls-tree" && args[3].includes("/automated/")) throw new Error("exit status 128");
    return git(args, cwd);
  };
};

type DiscoveryFailure = {
  git?: PremiumGitRunner;
  deployedFailure?: boolean;
  listingFailure?: boolean;
  laterPageFailure?: boolean;
  headFailure?: boolean;
};

const discoveryFailures: [string, DiscoveryFailure][] = [
  ["ambiguous canonical remote", { git: fakeGit(versions.canonical, { ambiguous: true }) }],
  ["missing canonical remote", { git: fakeGit(versions.canonical, { noCanonical: true }) }],
  ["canonical fetch failure", { git: fakeGit(versions.canonical, { failFetch: true }) }],
  ["automated branch inspection failure", { git: automatedBranchInspectionFailure() }],
  ["deployed read failure", { deployedFailure: true }],
  ["pull request listing failure", { listingFailure: true }],
  ["later pull request page failure", { laterPageFailure: true }],
  ["pull request head file failure", { headFailure: true }],
];

describe("premium retention discovery", () => {
  it.each([["canonical route", pageTwo], ["numeric repository route", numericPageTwo]])("uses canonical main and discovers pull requests across the %s", async (_name, nextPage) => {
    const calls: { url: string; auth: string | null; cacheControl: string | null }[] = [];
    const gitCalls: string[][] = [];
    const result = await discover({
      repoRoot: "fake-repo",
      runGit: (args, cwd) => { gitCalls.push(args); return fakeGit()(args, cwd); },
      fetcher: successfulFetch(calls, nextPage),
    });

    expect(result).toEqual({
      canonicalMainVersion: versions.canonical,
      deployedVersion: versions.deployed,
      pendingPullRequestVersions: [versions.firstHead, versions.secondHead],
      automatedBranchVersions: [],
    });
    expect(calls.some(({ url }) => url === nextPage)).toBe(true);
    expect(gitCalls).toContainEqual(["fetch", "pocketdecks", "refs/heads/main:refs/remotes/pocketdecks/main"]);
    expect(calls.filter(({ auth }) => auth === "Bearer dummy-test-token")).toHaveLength(4);
    expect(calls.find(({ url }) => url === "https://pocketdecks.top/data/data-version.json")).toEqual({
      url: "https://pocketdecks.top/data/data-version.json",
      auth: null,
      cacheControl: "no-cache",
    });
  });

  it("protects a pull request whose fork was deleted via the canonical PR ref", async () => {
    const calls: string[] = [];
    const fetcher = (async (input, init) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      calls.push(url.toString());
      if (url.origin === "https://pocketdecks.top") return response({ premium: versions.deployed });
      if (url.pathname === `/repos/${canonicalRepository}/pulls`) {
        return response([{
          number: 42,
          state: "open",
          base: { ref: "main", repo: { full_name: canonicalRepository } },
          head: { sha: "1".repeat(40), repo: null },
        }]);
      }
      if (url.pathname.endsWith("/contents/public/data/data-version.json")) {
        if (url.searchParams.get("ref") === "refs/pull/42/head") return response(apiVersionFile(versions.firstHead));
        throw new Error("unexpected ref");
      }
      throw new Error("unexpected API path");
    }) as typeof fetch;

    const result = await discover({ repoRoot: "fake-repo", runGit: fakeGit(), fetcher });

    expect(result?.pendingPullRequestVersions).toEqual([versions.firstHead]);
    expect(calls.some((url) => new URL(url).searchParams.get("ref") === "refs/pull/42/head")).toBe(true);
  });

  it("skips a pull request whose head has no premium version file", async () => {
    const fetcher = (async (input, init) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      if (url.origin === "https://pocketdecks.top") return response({ premium: versions.deployed });
      if (url.pathname === `/repos/${canonicalRepository}/pulls`) {
        return response([{
          number: 12,
          state: "open",
          base: { ref: "main", repo: { full_name: canonicalRepository } },
          head: { sha: "1".repeat(40), repo: { full_name: "contributor/old-branch" } },
        }]);
      }
      if (url.pathname.endsWith("/contents/public/data/data-version.json")) return response({}, 404);
      throw new Error("unexpected API path");
    }) as typeof fetch;

    const result = await discover({ repoRoot: "fake-repo", runGit: fakeGit(), fetcher });
    expect(result?.pendingPullRequestVersions).toEqual([]);
    expect(result?.canonicalMainVersion).toBe(versions.canonical);
  });

  it("protects a pushed refresh branch that has no pull request", async () => {
    const calls: { url: string; auth: string | null; cacheControl: string | null }[] = [];
    const result = await discover({
      repoRoot: "fake-repo",
      runGit: fakeGit(versions.canonical, { automatedBranch: versions.secondHead }),
      fetcher: successfulFetch(calls),
    });
    expect(result?.automatedBranchVersions).toEqual([versions.secondHead]);
  });

  it("reads a nested automated branch ref", async () => {
    const result = await discover({
      repoRoot: "fake-repo",
      runGit: fakeGit(versions.canonical, { automatedBranch: versions.secondHead }),
      fetcher: successfulFetch([]),
    });
    expect(result?.automatedBranchVersions).toEqual([versions.secondHead]);
  });

  it("skips an automated branch whose version file is unreadable and keeps the others", async () => {
    const warnings: string[] = [];
    const warn = vi.spyOn(console, "warn").mockImplementation((message?: unknown) => {
      warnings.push(String(message));
    });
    try {
      const result = await discover({
        repoRoot: "fake-repo",
        runGit: automatedBranchesGit({
          "refs/remotes/pocketdecks/automated/broken": "{",
          "refs/remotes/pocketdecks/automated/refresh": `{ "premium": "${versions.secondHead}" }\n`,
        }),
        fetcher: successfulFetch([]),
      });

      expect(result?.automatedBranchVersions).toEqual([versions.secondHead]);
      expect(warnings.join("\n")).toContain("refs/remotes/pocketdecks/automated/broken");
      expect(warnings.join("\n")).not.toContain("refs/remotes/pocketdecks/automated/refresh");
    } finally {
      warn.mockRestore();
    }
  });

  it("falls back to the canonical PR ref when the fork version file is unreadable", async () => {
    const fetcher = (async (input, init) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      if (url.origin === "https://pocketdecks.top") return response({ premium: versions.deployed });
      if (url.pathname === `/repos/${canonicalRepository}/pulls`) {
        return response([{
          number: 9,
          state: "open",
          base: { ref: "main", repo: { full_name: canonicalRepository } },
          head: { sha: "1".repeat(40), repo: { full_name: "contributor/deleted-fork" } },
        }]);
      }
      if (url.pathname.endsWith("/contents/public/data/data-version.json")) {
        if (url.searchParams.get("ref") === "refs/pull/9/head") return response(apiVersionFile(versions.firstHead));
        return response({}, 404);
      }
      throw new Error("unexpected API path");
    }) as typeof fetch;

    const result = await discover({ repoRoot: "fake-repo", runGit: fakeGit(), fetcher });
    expect(result?.pendingPullRequestVersions).toEqual([versions.firstHead]);
  });

  it("refuses to prune when a later page changes during pagination", async () => {
    const numbered = (number: number) => ({
      ...pull("contributor/refresh", "1".repeat(40)),
      number,
    });
    let pageTwoReads = 0;
    const fetcher = (async (input, init) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      if (url.origin === "https://pocketdecks.top") return response({ premium: versions.deployed });
      if (url.pathname.endsWith("/contents/public/data/data-version.json")) return response(apiVersionFile(versions.firstHead));
      if (url.pathname === `/repos/${canonicalRepository}/pulls`) {
        if (url.searchParams.get("page") === "2") {
          pageTwoReads += 1;
          return response(pageTwoReads === 1 ? [numbered(2)] : [numbered(3)]);
        }
        return response([numbered(1)], 200, `<${pageTwo}>; rel="next"`);
      }
      throw new Error("unexpected API path");
    }) as typeof fetch;

    expect(await discover({ repoRoot: "fake-repo", runGit: fakeGit(), fetcher })).toBeUndefined();
    expect(pageTwoReads).toBe(2);
  });

  it("bounds every discovery request with an abort signal", async () => {
    const signals: unknown[] = [];
    const fetcher = (async (input, init) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      signals.push(init?.signal);
      if (url.origin === "https://pocketdecks.top") return response({ premium: versions.deployed });
      if (url.pathname === `/repos/${canonicalRepository}/pulls`) return response([]);
      throw new Error("unexpected API path");
    }) as typeof fetch;

    expect(await discover({ repoRoot: "fake-repo", runGit: fakeGit(), fetcher })).toBeDefined();
    expect(signals.length).toBeGreaterThan(1);
    expect(signals.every((signal) => signal instanceof AbortSignal)).toBe(true);
  });

  it("refuses to prune when the pull request list changes during pagination", async () => {
    const numbered = { ...pull("contributor/refresh", "1".repeat(40)), number: 7 };
    let pageOneReads = 0;
    const fetcher = (async (input, init) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      if (url.origin === "https://pocketdecks.top") return response({ premium: versions.deployed });
      if (url.pathname.endsWith("/contents/public/data/data-version.json")) return response(apiVersionFile(versions.firstHead));
      if (url.pathname === `/repos/${canonicalRepository}/pulls`) {
        if (url.searchParams.get("page") === "2") return response([]);
        pageOneReads += 1;
        return response(pageOneReads === 1 ? [numbered] : []);
      }
      throw new Error("unexpected API path");
    }) as typeof fetch;

    const result = await discover({ repoRoot: "fake-repo", runGit: fakeGit(), fetcher });
    expect(result).toBeUndefined();
    expect(pageOneReads).toBe(2);
  });

  it.each([
    ["per_page is not 100", `${apiRoot}?state=open&base=main&per_page=50&page=2`],
    ["page is missing", `${apiRoot}?state=open&base=main&per_page=100`],
    ["page is not numeric", `${apiRoot}?state=open&base=main&per_page=100&page=next`],
    ["base is not main", `${apiRoot}?state=open&base=release&per_page=100&page=2`],
  ])("rejects a pagination link whose %s", async (_name, link) => {
    const fetcher = (async (input, init) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      if (url.origin === "https://pocketdecks.top") return response({ premium: versions.deployed });
      if (url.pathname === `/repos/${canonicalRepository}/pulls`) return response([], 200, `<${link}>; rel="next"`);
      throw new Error("unexpected API path");
    }) as typeof fetch;

    expect(await discover({ repoRoot: "fake-repo", runGit: fakeGit(), fetcher })).toBeUndefined();
  });

  it("rejects pagination to another host without sending the token there", async () => {
    const calls: { url: string; auth: string | null }[] = [];
    const fetcher = (async (input, init) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      calls.push({ url: url.toString(), auth: new Headers(init?.headers).get("authorization") });
      if (url.origin === "https://pocketdecks.top") return response({ premium: versions.deployed });
      return response([], 200, "<https://attacker.test/pulls?page=2>; rel=next");
    }) as typeof fetch;

    expect(await discover({ repoRoot: "fake-repo", runGit: fakeGit(), fetcher })).toBeUndefined();
    expect(calls.some(({ url }) => url.startsWith("https://attacker.test"))).toBe(false);
  });

  it.each(discoveryFailures)("returns no pruning sources after a %s", async (_name, failure) => {
    const calls: { url: string; auth: string | null }[] = [];
    const fetcher = (async (input, init) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      calls.push({ url: url.toString(), auth: new Headers(init?.headers).get("authorization") });
      if (url.origin === "https://pocketdecks.top") {
        return response(failure.deployedFailure ? {} : { premium: versions.deployed }, failure.deployedFailure ? 503 : 200);
      }
      if (url.searchParams.get("page") === "2") return response([], failure.laterPageFailure ? 503 : 200);
      if (url.pathname.endsWith("/contents/public/data/data-version.json")) {
        return response(apiVersionFile(versions.firstHead), failure.headFailure ? 503 : 200);
      }
      return response(pullPages(), failure.listingFailure ? 503 : 200, `<${pageTwo}>; rel="next"`);
    }) as typeof fetch;
    const result = await discover({
      repoRoot: "fake-repo",
      runGit: failure.git ?? fakeGit(),
      fetcher,
    });

    expect(result).toBeUndefined();
    const writes: string[] = [];
    const deletes: string[] = [];
    const files = Object.fromEntries(PREMIUM_ARTEFACT_NAMES.map((name) => [name, `payload:${name}`]));
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "premium-retention-fail-"));
    const snapshotDir = path.join(tempDir, "premium");
    const oldSnapshot = path.join(tempDir, "premium-previous", "eeeeeeeeeeeeeeee");
    fs.mkdirSync(oldSnapshot, { recursive: true });
    await publishPremium({
      db: noPruneDb(writes, deletes),
      dryRun: false,
      projectId: "test-project",
      files,
      version: premiumVersion(files),
      snapshotDir,
      discoverRetentionSources: async () => result,
    }, () => {});
    expect(writes).toHaveLength(PREMIUM_ARTEFACT_NAMES.length + 1);
    expect(deletes).toEqual([]);
    expect(fs.existsSync(oldSnapshot)).toBe(true);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
