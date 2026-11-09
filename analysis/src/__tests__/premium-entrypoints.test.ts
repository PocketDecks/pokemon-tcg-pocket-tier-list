import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";

import { adaptPremiumDb, publishPremium, readLiveVersion } from "../../scripts/publish-premium";
import {
  loadPremiumSnapshotForVersion,
  PREMIUM_ARTEFACT_NAMES,
  premiumVersion,
  sha256Hex,
  snapshotPremiumVersion,
} from "../utils/premium-artefacts";

const premiumPayloads = (): Record<string, string> =>
  Object.fromEntries(PREMIUM_ARTEFACT_NAMES.map((name) => [name, `{"name":"${name}"}`]));

interface Write {
  path: string;
  data: unknown;
}

const fakeFilesDb = (writes: Write[], deletes: unknown[] = []) => ({
  collection: () => ({
    listDocuments: async () => Array.from({ length: 6 }, (_, index) => ({
      id: `old-${index}`,
      get: async () => ({ exists: true, get: () => 1 }),
    })),
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

it("prunes an orphan parent returned by the Firestore SDK adapter", async () => {
  const writes: Write[] = [];
  const deletes: unknown[] = [];
  const firestore = {
    collection: () => ({
      get: async () => ({ docs: [] }),
      listDocuments: async () => {
        return [...Array.from({ length: 5 }, (_, i) => ({ id: `old-${i}`, get: async () => ({ exists: true, get: () => Timestamp.fromMillis((i + 1) * 1000) }) })),
          { id: "orphan", get: async () => ({ exists: false, get: () => undefined }) }];
      },
    }),
    doc: (path: string) => ({ path, set: async () => {}, get: async () => ({ exists: false, get: () => undefined }) }),
    recursiveDelete: async (ref: unknown) => deletes.push(ref),
  };
  const files = premiumPayloads();
  await publishPremium({ db: adaptPremiumDb(firestore as never), dryRun: false, files, version: premiumVersion(files), liveVersion: "live" }, () => {});
  expect(deletes).toContainEqual(expect.objectContaining({ path: "premiumData/orphan" }));
  expect(deletes).toContainEqual(expect.objectContaining({ path: "premiumData/old-0" }));
});

describe("premium entry points", () => {
  it("a dry run plans the writes without touching the database", async () => {
    const lines: string[] = [];
    const snapshotDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "premium-dry-run-")), "premium");
    const files = premiumPayloads();
    const version = premiumVersion(files);
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
      { db, dryRun: true, files, version, snapshotDir },
      (line) => lines.push(line)
    );
    expect(lines[0]).toMatch(/Dry run for project .+, version [0-9a-f]{16}/);
    expect(fs.existsSync(path.join(snapshotDir, "..", "premium-previous", version))).toBe(false);
  });

  it("publishes the artefacts and the version document through the injected database", async () => {
    const writes: Write[] = [];
    const deletes: unknown[] = [];
    const files = premiumPayloads();
    const version = premiumVersion(files);
    const snapshotDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "premium-publish-snapshot-")), "premium");
    const db = fakeFilesDb(writes, deletes);
    await publishPremium(
      { db, dryRun: false, files, version, liveVersion: "old-5", snapshotDir },
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
    expect(writes[writes.length - 1]?.path).toBe(`premiumData/${version}`);
    expect(fs.existsSync(path.join(snapshotDir, "..", "premium-previous", version, `${PREMIUM_ARTEFACT_NAMES[0]}.json`))).toBe(true);
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

  it("does not write the version or snapshot after an artefact failure", async () => {
    const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "premium-failed-upload-")), "premium");
    const files = premiumPayloads();
    const writes: Write[] = [];
    const db = {
      ...fakeFilesDb(writes),
      doc: (path: string) => ({ ref: { path }, set: async (data: unknown) => { writes.push({ path, data }); throw new Error("write failed"); } }),
    };
    await expect(publishPremium({ db, dryRun: false, files, version: premiumVersion(files), snapshotDir: dir }, () => {})).rejects.toThrow("write failed");
    expect(writes.some((write) => write.path === `premiumData/${premiumVersion(files)}`)).toBe(false);
    expect(fs.existsSync(path.join(dir, "..", "premium-previous", premiumVersion(files)))).toBe(false);
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
      const published = Object.fromEntries(PREMIUM_ARTEFACT_NAMES.map((name) => [name, `published:${name}`]));
      const publishedVersion = premiumVersion(published);
      const unmerged = Object.fromEntries(PREMIUM_ARTEFACT_NAMES.map((name) => [name, `unmerged:${name}`]));
      const unmergedVersion = premiumVersion(unmerged);
      commitVersion(publishedVersion);
      git("update-ref", "refs/remotes/origin/main", "HEAD");
      commitVersion(unmergedVersion);
      const liveVersion = readLiveVersion(repo);
      expect(liveVersion).toBe(publishedVersion);
      const snapshotDir = path.join(repo, "analysis", "out", "premium");
      snapshotPremiumVersion(unmerged, unmergedVersion, snapshotDir);
      expect(loadPremiumSnapshotForVersion(liveVersion as string, snapshotDir)).toBeUndefined();
      snapshotPremiumVersion(published, publishedVersion, snapshotDir);
      expect(loadPremiumSnapshotForVersion(liveVersion as string, snapshotDir)).toEqual(published);
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

  it.each(["{", '{ "premium": "deadbeef" }'])("rejects a malformed origin/main premium value", (contents) => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "live-version-invalid-"));
    const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", ...args], { cwd: repo, stdio: "ignore" });
    try {
      git("init", "-q");
      fs.mkdirSync(path.join(repo, "public/data"), { recursive: true });
      fs.writeFileSync(path.join(repo, "public/data/data-version.json"), contents);
      git("add", "-A"); git("commit", "-q", "-m", "invalid"); git("update-ref", "refs/remotes/origin/main", "HEAD");
      expect(readLiveVersion(repo)).toBeUndefined();
    } finally { fs.rmSync(repo, { recursive: true, force: true }); }
  });
});
