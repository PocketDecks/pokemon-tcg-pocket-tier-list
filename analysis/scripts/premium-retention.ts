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
      linked.searchParams.get("state") !== "open" || linked.searchParams.get("base") !== "main" || linked.searchParams.get("per_page") !== "100") {
    throw new Error("pagination destination is not the canonical pull request list");
  }
  const next = new URL(current);
  const nextPage = Number(current.searchParams.get("page") ?? "1") + 1;
  next.searchParams.set("page", String(nextPage));
  return next;
};

const contentVersion = async (response: Response): Promise<string> => {
  if (!response.ok) throw new Error("version source request failed");
  const value = await response.json();
  const version = versionOf(value);
  if (!version) throw new Error("version source has no valid premium value");
  return version;
};

const readPullRequestVersion = async (
  pullRequest: unknown,
  fetcher: typeof fetch,
  headers: Record<string, string>
): Promise<string | undefined> => {
  if (pullRequest === null || typeof pullRequest !== "object") throw new Error("pull request entry is invalid");
  const pull = pullRequest as {
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

  const repository = repositoryParts(pull.head?.repo?.full_name);
  const sha = pull.head?.sha;
  if (!repository || typeof sha !== "string" || !/^[0-9a-f]{40,64}$/i.test(sha)) {
    throw new Error("open pull request head is unavailable");
  }
  const url = new URL(
    `https://api.github.com/repos/${repository[0]}/${repository[1]}/contents/public/data/data-version.json`
  );
  url.searchParams.set("ref", sha);
  const response = await fetcher(url, { headers, cache: "no-store", redirect: "manual" });
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
    }));
    git(["fetch", remote, "refs/heads/main:refs/remotes/" + remote + "/main"], repoRoot);
    const canonicalMainVersion = readPremiumVersionAtRef(repoRoot, ref, git);
    if (!canonicalMainVersion) return undefined;

    const deployed = await fetcher("https://pocketdecks.top/data/data-version.json", {
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
    let page: URL | undefined = firstPage;
    while (page) {
      if (visited.has(page.toString())) throw new Error("pull request pagination repeated a page");
      visited.add(page.toString());
      const response = await fetcher(page, { headers, cache: "no-store", redirect: "manual" });
      if (!response.ok) throw new Error("pull request listing failed");
      const pullRequests = await response.json();
      if (!Array.isArray(pullRequests)) throw new Error("pull request listing is not an array");
      for (const pullRequest of pullRequests) {
        const version = await readPullRequestVersion(pullRequest, fetcher, headers);
        if (version) pendingVersions.push(version);
      }
      page = nextPageOf(response.headers.get("link"), page);
    }

    return {
      canonicalMainVersion,
      deployedVersion,
      pendingPullRequestVersions: [...new Set(pendingVersions)],
    };
  } catch {
    return undefined;
  }
};
