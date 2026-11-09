import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { publishPremium, readLiveVersion } from "../../scripts/publish-premium";
import { PREMIUM_ARTEFACT_NAMES, premiumVersion, sha256Hex } from "../utils/premium-artefacts";

const premiumPayloads = (): Record<string, string> =>
  Object.fromEntries(PREMIUM_ARTEFACT_NAMES.map((name) => [name, `{"name":"${name}"}`]));

interface Write {
  path: string;
  data: unknown;
}

const fakeFilesDb = (writes: Write[], deletes: unknown[] = []) => ({
  collection: () => ({
    get: async () => ({
      docs: Array.from({ length: 6 }, (_, index) => ({
        id: `old-${index}`,
        get: () => 1,
      })),
    }),
  }),
  doc: (path: string) => ({
    ref: { path, documentReference: true },
    set: async (data: unknown) => {
      writes.push({ path, data });
    },
  }),
  recursiveDelete: async (ref: unknown) => {
    deletes.push(ref);
  },
});

describe("premium entry points", () => {
  it("a dry run plans the writes without touching the database", async () => {
    const lines: string[] = [];
    const db = {
      collection: () => {
        throw new Error("dry run accessed collection");
      },
      doc: () => {
        throw new Error("dry run accessed document");
      },
      recursiveDelete: async () => {
        throw new Error("dry run accessed recursive delete");
      },
    };
    await publishPremium(
      { db, dryRun: true, files: premiumPayloads(), version: premiumVersion(premiumPayloads()) },
      (line) => lines.push(line)
    );
    expect(lines[0]).toMatch(/Dry run for project .+, version [0-9a-f]{16}/);
  });

  it("publishes the artefacts and the version document through the injected database", async () => {
    const writes: Write[] = [];
    const deletes: unknown[] = [];
    const files = premiumPayloads();
    const version = premiumVersion(files);
    const db = fakeFilesDb(writes, deletes);
    await publishPremium(
      { db, dryRun: false, files, version, liveVersion: "old-5" },
      () => {}
    );
    expect(writes.length).toBe(PREMIUM_ARTEFACT_NAMES.length + 1);
    const artefactWrites = writes.filter((write) => write.path.includes("/artefacts/"));
    expect(artefactWrites).toHaveLength(PREMIUM_ARTEFACT_NAMES.length);
    expect(artefactWrites.map((write) => write.path.split("/").pop()).sort()).toEqual(
      [...PREMIUM_ARTEFACT_NAMES].sort()
    );
    for (const write of artefactWrites) {
      const name = write.path.split("/").pop() as string;
      expect(write.data).toEqual({ payload: files[name], sha256: sha256Hex(files[name]) });
    }
    expect(writes.filter((write) => write.path === `premiumData/${version}`)).toEqual([
      {
        path: `premiumData/${version}`,
        data: expect.objectContaining({
          artefacts: Object.fromEntries(
            PREMIUM_ARTEFACT_NAMES.map((name) => [name, sha256Hex(files[name])])
          ),
        }),
      },
    ]);
    expect(deletes).toEqual([{ path: "premiumData/old-4", documentReference: true }]);
  });

  it("deletes no older version when the live version cannot be read", async () => {
    const writes: Write[] = [];
    const deletes: unknown[] = [];
    const lines: string[] = [];
    const files = premiumPayloads();
    const version = premiumVersion(files);
    await publishPremium(
      { db: fakeFilesDb(writes, deletes), dryRun: false, files, version },
      (line) => lines.push(line)
    );
    expect(writes.length).toBe(PREMIUM_ARTEFACT_NAMES.length + 1);
    expect(deletes).toEqual([]);
    expect(lines).toContain(
      "the live version could not be read from origin/main, so no older version is deleted"
    );
  });

  it("reports no database writes when the database is not configured", async () => {
    const lines: string[] = [];
    await publishPremium(
      { db: null, dryRun: false, files: premiumPayloads(), version: premiumVersion(premiumPayloads()) },
      (line) => lines.push(line)
    );
    expect(lines[0]).toMatch(/No database configured/);
  });

  it("reads the live version from origin/main rather than the checked-out commit", () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "live-version-"));
    const git = (...args: string[]) =>
      execFileSync(
        "git",
        ["-c", "user.name=test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...args],
        { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
      );
    const commitVersion = (version: string) => {
      fs.mkdirSync(path.join(repo, "public/data"), { recursive: true });
      fs.writeFileSync(path.join(repo, "public/data/data-version.json"), `{ "premium": "${version}" }\n`);
      git("add", "-A");
      git("commit", "-q", "-m", `version ${version}`);
    };
    try {
      git("init", "-q");
      commitVersion("aaaaaaaaaaaaaaaa");
      git("update-ref", "refs/remotes/origin/main", "HEAD");
      commitVersion("bbbbbbbbbbbbbbbb");
      expect(readLiveVersion(repo)).toBe("aaaaaaaaaaaaaaaa");
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it("returns no live version when origin/main has no premium version", () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "live-version-none-"));
    try {
      execFileSync("git", ["init", "-q"], { cwd: repo, stdio: "ignore" });
      expect(readLiveVersion(repo)).toBeUndefined();
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
});
