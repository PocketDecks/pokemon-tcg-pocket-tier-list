import { execFileSync } from "node:child_process";

import {
  CANONICAL_PREMIUM_REPOSITORY,
  PremiumGitRunner,
  readPremiumVersionAtRef,
  resolveCanonicalMainRef,
} from "../src/utils/premium-files";

export interface PremiumRetentionSources {
  canonicalMainVersion: string;
  deployedVersion: string;
  pendingPullRequestVersions: string[];
  automatedBranchVersions?: string[];
}

const versionOf = (value: unknown): string | undefined => {
  if (value === null || typeof value !== "object") return undefined;
  const version = (value as { premium?: unknown }).premium;
  return typeof version === "string" && /^[0-9a-f]{16}$/.test(version) ? version : undefined;
};

const repositoryParts = (value: unknown): [string, string] | undefined => {
  if (typeof value !== "string" || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) return undefined;
  return value.split("/") as [string, string];
};

const FETCH_TIMEOUT_MS = 15_000;
const GIT_TIMEOUT_MS = 60_000;
const timedFetch = (fetcher: typeof fetch, url: URL, init: RequestInit): Promise<Response> =>
  fetcher(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });

const nextPageOf = (link: string | null, current: URL): URL | undefined => {
  if (!link) return undefined;
  const match = /<([^>]+)>\s*;\s*rel\s*=\s*"?next"?/i.exec(link);
  if (!match) {
    if (/rel\s*=\s*"?next"?/i.test(link)) throw new Error("invalid pagination link");
    return undefined;
  }
  const linked = new URL(match[1], current);
  const expectedPath = `/repos/${CANONICAL_PREMIUM_REPOSITORY}/pulls`;
  if (linked.origin !== "https://api.github.com" ||
      (linked.pathname.toLowerCase() !== expectedPath.toLowerCase() && !/^\/repositories\/\d+\/pulls$/i.test(linked.pathname)) ||
      linked.searchParams.get("state") !== "open" || linked.searchParams.get("base") !== "main" || linked.searchParams.get("per_page") !== "100" ||
      !/^\d+$/.test(linked.searchParams.get("page") ?? "")) {
    throw new Error("pagination destination is not the canonical pull request list");
  }
  return linked;
};

const contentVersion = async (response: Response): Promise<string> => {
  if (!response.ok) throw new Error("version source request failed");
  const value = await response.json();
  const version = versionOf(value);
  if (!version) throw new Error("version source has no valid premium value");
  return version;
};

const versionFileUrl = (repository: [string, string], ref: string): URL => {
  const url = new URL(
    `https://api.github.com/repos/${repository[0]}/${repository[1]}/contents/public/data/data-version.json`
  );
  url.searchParams.set("ref", ref);
  return url;
};

const readVersionFile = async (
  fetcher: typeof fetch,
  url: URL,
  headers: Record<string, string>
): Promise<string | undefined> => {
  const response = await timedFetch(fetcher, url, { headers, cache: "no-store", redirect: "manual" });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error("pull request version request failed");
  const value = await response.json() as { encoding?: unknown; content?: unknown };
  if (value.encoding !== "base64" || typeof value.content !== "string") {
    throw new Error("pull request version file is not base64 content");
  }
  const encoded = value.content.replace(/\s/g, "");
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    throw new Error("pull request version file has invalid base64 content");
  }
  const text = Buffer.from(encoded, "base64").toString("utf8");
  const version = versionOf(JSON.parse(text));
  if (!version) throw new Error("pull request version file has no valid premium value");
  return version;
};

const readPullRequestVersion = async (
  pullRequest: unknown,
  fetcher: typeof fetch,
  headers: Record<string, string>
): Promise<string | undefined> => {
  if (pullRequest === null || typeof pullRequest !== "object") throw new Error("pull request entry is invalid");
  const pull = pullRequest as {
    number?: unknown;
    state?: unknown;
    base?: { ref?: unknown; repo?: { full_name?: unknown } | null };
    head?: { sha?: unknown; repo?: { full_name?: unknown } | null };
  };
  if (typeof pull.state !== "string") throw new Error("pull request state is missing");
  if (pull.state !== "open") return undefined;
  const baseRepository = pull.base?.repo?.full_name;
  if (typeof pull.base?.ref !== "string" || typeof baseRepository !== "string") {
    throw new Error("pull request base is incomplete");
  }
  if (
    pull.base.ref !== "main" ||
    baseRepository.toLowerCase() !== CANONICAL_PREMIUM_REPOSITORY.toLowerCase()
  ) return undefined;

  const number = typeof pull.number === "number" && Number.isInteger(pull.number) && pull.number > 0
    ? pull.number
    : undefined;
  const fork = repositoryParts(pull.head?.repo?.full_name);
  const sha = pull.head?.sha;
  const shaLabel = typeof sha === "string" && /^[0-9a-f]{40,64}$/i.test(sha) ? sha : undefined;
  const canonical = repositoryParts(CANONICAL_PREMIUM_REPOSITORY)!;
  const candidates: URL[] = [];
  if (fork && shaLabel) candidates.push(versionFileUrl(fork, shaLabel));
  if (number !== undefined) candidates.push(versionFileUrl(canonical, `refs/pull/${number}/head`));
  if (!candidates.length) throw new Error("open pull request head is unavailable");

  let hardFailure: string | null = null;
  let missing = false;
  for (const url of candidates) {
    try {
      const version = await readVersionFile(fetcher, url, headers);
      if (version !== undefined) return version;
      missing = true;
    } catch (error) {
      hardFailure = error instanceof Error ? error.message : String(error);
    }
  }
  if (missing && hardFailure === null) {
    console.warn(`open pull request #${number ?? "?"} has no premium version file; nothing to protect`);
    return undefined;
  }
  throw new Error(`open pull request #${number ?? "?"} version could not be read: ${hardFailure ?? "no readable head"}`);
};

export const discoverPremiumRetentionSources = async ({
  repoRoot,
  fetcher = fetch,
  runGit,
}: {
  repoRoot: string;
  fetcher?: typeof fetch;
  runGit?: PremiumGitRunner;
}): Promise<PremiumRetentionSources | undefined> => {
  try {
    const ref = resolveCanonicalMainRef(repoRoot, runGit);
    if (!ref) return undefined;
    const remote = ref.match(/^refs\/remotes\/([^/]+)\/main$/)?.[1];
    if (!remote) return undefined;
    const git = runGit ?? ((args: string[], cwd: string) => execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: GIT_TIMEOUT_MS,
    }));
    git(["fetch", remote, "refs/heads/main:refs/remotes/" + remote + "/main"], repoRoot);
    const canonicalMainVersion = readPremiumVersionAtRef(repoRoot, ref, git);
    if (!canonicalMainVersion) return undefined;

    const automatedBranchVersions = (() => {
      const refs = git(["for-each-ref", "--format=%(refname)", "refs/heads/automated/", "refs/remotes/"], repoRoot)
        .split(/\r?\n/)
        .filter((ref) => /^refs\/(?:heads\/automated\/|remotes\/[^/]+\/automated\/)/.test(ref));
      const versions: string[] = [];
      for (const branchRef of refs) {
        const versionPath = "public/data/data-version.json";
        let paths: string[];
        try {
          paths = git(["ls-tree", "-r", "--name-only", branchRef, "--", versionPath], repoRoot)
            .split(/\r?\n/)
            .filter(Boolean);
        } catch (error) {
          throw new Error(`automated branch ${branchRef} version file could not be inspected: ${error instanceof Error ? error.message : String(error)}`);
        }
        if (!paths.includes(versionPath)) continue;
        const version = versionOf(JSON.parse(git(["show", `${branchRef}:${versionPath}`], repoRoot)));
        if (version) versions.push(version);
        else throw new Error(`automated branch ${branchRef} has no valid premium version`);
      }
      return [...new Set(versions)];
    })();

    const deployed = await timedFetch(fetcher, new URL("https://pocketdecks.top/data/data-version.json"), {
      headers: { accept: "application/json", "cache-control": "no-cache" },
      cache: "no-store",
      redirect: "manual",
    });
    const deployedVersion = await contentVersion(deployed);

    const token = process.env.GITHUB_TOKEN;
    const headers: Record<string, string> = {
      accept: "application/vnd.github+json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    };
    const firstPage = new URL(`https://api.github.com/repos/${CANONICAL_PREMIUM_REPOSITORY}/pulls`);
    firstPage.search = new URLSearchParams({ state: "open", base: "main", per_page: "100" }).toString();
    const visited = new Set<string>();
    const pendingVersions: string[] = [];
    const pageNumbers: { url: URL; numbers: Set<number> }[] = [];
    let page: URL | undefined = firstPage;
    while (page) {
      if (visited.has(page.toString())) throw new Error("pull request pagination repeated a page");
      visited.add(page.toString());
      const response = await timedFetch(fetcher, page, { headers, cache: "no-store", redirect: "manual" });
      if (!response.ok) throw new Error("pull request listing failed");
      const pullRequests = await response.json();
      if (!Array.isArray(pullRequests)) throw new Error("pull request listing is not an array");
      const numbers = new Set<number>();
      for (const pullRequest of pullRequests) {
        if (typeof pullRequest === "object" && pullRequest !== null) {
          const number = (pullRequest as { number?: unknown }).number;
          if (typeof number === "number" && Number.isInteger(number)) numbers.add(number);
        }
        const version = await readPullRequestVersion(pullRequest, fetcher, headers);
        if (version) pendingVersions.push(version);
      }
      pageNumbers.push({ url: page, numbers });
      page = nextPageOf(response.headers.get("link"), page);
    }

    if (pageNumbers.some(({ numbers }) => numbers.size > 0)) {
      for (const { url, numbers } of pageNumbers) {
        const repeat = await timedFetch(fetcher, url, { headers, cache: "no-store", redirect: "manual" });
        if (!repeat.ok) throw new Error("pull request pagination stability check failed");
        const current = await repeat.json();
        if (!Array.isArray(current)) throw new Error("pull request listing is not an array");
        const seen = new Set<number>();
        for (const entry of current) {
          const number = (entry as { number?: unknown } | null)?.number;
          if (typeof number === "number" && Number.isInteger(number)) seen.add(number);
        }
        if (seen.size !== numbers.size || [...seen].some((number) => !numbers.has(number))) {
          throw new Error(
            `pull request list changed during pagination on page ${url.searchParams.get("page") ?? "1"}; refusing to prune`
          );
        }
      }
    }

    return {
      canonicalMainVersion,
      deployedVersion,
      pendingPullRequestVersions: [...new Set(pendingVersions)],
      automatedBranchVersions,
    };
  } catch (error) {
    console.warn(
      `premium retention discovery could not read every source (${error instanceof Error ? error.message : String(error)}); ` +
      "no older version is deleted"
    );
    return undefined;
  }
};
