import { execFileSync } from "node:child_process";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";

import { adaptPremiumDb, publishPremium } from "../../scripts/publish-premium";
import * as publisher from "../../scripts/publish-premium";
import {
  loadPremiumSnapshotForVersion,
  PREMIUM_ARTEFACT_NAMES,
  premiumVersion,
  sha256Hex,
  snapshotPremiumVersion,
} from "../utils/premium-artefacts";
import { readPremiumVersionAtRef } from "../utils/premium-files";

const premiumPayloads = (): Record<string, string> =>
  Object.fromEntries(PREMIUM_ARTEFACT_NAMES.map((name) => [name, `{"name":"${name}"}`]));

const retentionSources = (canonicalMainVersion = "main") => ({
  canonicalMainVersion,
  deployedVersion: "deployed",
  pendingPullRequestVersions: [],
});

const snapshotRoots: string[] = [];

afterEach(() => {
  for (const root of snapshotRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

const testSnapshotDir = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "premium-entrypoint-snapshot-"));
  snapshotRoots.push(root);
  return path.join(root, "premium");
};

interface Write {
  path: string;
  data: unknown;
}

const fakeFilesDb = (
  writes: Write[],
  deletes: unknown[] = [],
  existing: { version: string; createdAt: number }[] = Array.from({ length: 6 }, (_, index) => ({
    version: `old-${index}`,
    createdAt: 0,
  })),
  hooks: {
    afterWrite?: (path: string, data: unknown, setLock: (data: Record<string, unknown>) => void) => void | Promise<void>;
    failWrite?: boolean;
    failDelete?: boolean;
  } = {}
) => {
  let lock: Record<string, unknown> | undefined;
  let listCount = 0;
  return {
    collection: () => ({
      listDocuments: async () => {
        listCount += 1;
        return existing.map(({ version, createdAt }) => ({
          id: version,
          get: async () => ({ exists: true, get: () => Timestamp.fromMillis(createdAt) }),
        }));
      },
    }),
    doc: (path: string) => ({
      ref: { path, documentReference: true },
      set: async (data: unknown) => {
        await hooks.afterWrite?.(path, data, (next) => {
          lock = next;
        });
        writes.push({ path, data });
        if (hooks.failWrite) throw new Error("write failed");
      },
    }),
    recursiveDelete: async (ref: unknown) => {
      deletes.push(ref);
      if (hooks.failDelete) throw new Error("delete failed");
    },
    runTransaction: async <T>(callback: (transaction: {
      get: (ref: unknown) => Promise<{ exists: boolean; get: (field: string) => unknown }>;
      create: (ref: unknown, data: Record<string, unknown>) => void;
      delete: (ref: unknown) => void;
    }) => Promise<T>): Promise<T> => callback({
      get: async () => ({ exists: lock !== undefined, get: (field) => lock?.[field] }),
      create: (_ref, data) => {
        if (lock !== undefined) throw new Error("lock already exists");
        lock = data;
      },
      delete: () => {
        lock = undefined;
      },
    }),
    lockOwner: () => lock?.owner,
    setLock: (data: Record<string, unknown>) => {
      lock = data;
    },
    listCount: () => listCount,
  };
};

const deferred = (): { promise: Promise<void>; resolve: () => void } => {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

type CliInput = {
  args: string[];
  projectId: string;
  files: Record<string, string>;
  version: string;
  initializeDatabase: () => Parameters<typeof publishPremium>[0]["db"];
  discoverRetentionSources: () => Promise<{
    canonicalMainVersion: string;
    deployedVersion: string;
    pendingPullRequestVersions: string[];
  } | undefined>;
  publish: (input: Parameters<typeof publishPremium>[0]) => Promise<void>;
  log: (line: string) => void;
  reportError: (message: string) => void;
};

const runCli = (publisher as unknown as {
  runPublishPremiumCli?: (input: CliInput) => Promise<number>;
}).runPublishPremiumCli;

it("prunes an orphan parent returned by the Firestore SDK adapter", async () => {
  const writes: Write[] = [];
  const deletes: unknown[] = [];
  const snapshotDir = testSnapshotDir();
  let lock: Record<string, unknown> | undefined;
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
  const files = premiumPayloads();
  await publishPremium({ db: adaptPremiumDb(firestore as never), dryRun: false, files, version: premiumVersion(files), retentionSources: retentionSources("live"), snapshotDir } as Parameters<typeof publishPremium>[0], () => {});
  expect(deletes).toContainEqual(expect.objectContaining({ path: "premiumData/orphan" }));
  expect(deletes).toContainEqual(expect.objectContaining({ path: "premiumData/old-0" }));
});

describe("premium entry points", () => {
  it.each([[""], ["", "--unknown"]])("rejects empty CLI arguments before credentials: %j", async (...values) => {
    const args = values as string[];
    let initialized = false;
    const failures: string[] = [];
    const result = await runCli!({
      args, projectId: "test-project", files: premiumPayloads(), version: "aaaaaaaaaaaaaaaa",
      initializeDatabase: () => { initialized = true; throw new Error("unexpected credentials"); },
      discoverRetentionSources: async () => undefined,
      publish: async () => {},
      reportError: (message) => { failures.push(message); }, log: () => {},
    });
    expect(result).toBe(1);
    expect(initialized).toBe(false);
    expect(failures[0]).toContain("unknown argument");
  });

  it("runs the CLI main block and rejects unsupported arguments", () => {
    const script = path.resolve(__dirname, "../../scripts/publish-premium.ts");
    const result = spawnSync(process.execPath, ["-r", "ts-node/register", script, "--unknown"], {
      cwd: path.resolve(__dirname, "../.."),
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("unknown argument");
  });

  it("runs an injected dry-run CLI without initialising credentials", async () => {
    if (typeof runCli !== "function") {
      expect(runCli).toBeTypeOf("function");
      return;
    }
    const files = premiumPayloads();
    let initialized = false;
    let discovered = false;
    let published: { dryRun: boolean; db: unknown } | undefined;
    const exitCode = await runCli({
      args: ["--dry-run"],
      projectId: "test-project",
      files,
      version: premiumVersion(files),
      initializeDatabase: () => {
        initialized = true;
        throw new Error("credentials accessed");
      },
      discoverRetentionSources: async () => {
        discovered = true;
        return undefined;
      },
      publish: async (input) => {
        published = { dryRun: input.dryRun, db: input.db };
      },
      log: () => {},
      reportError: () => {},
    });

    expect(exitCode).toBe(0);
    expect(initialized).toBe(false);
    expect(discovered).toBe(false);
    expect(published).toEqual({ dryRun: true, db: null });
  });

  it("returns a non-zero CLI result when credential or publish setup fails", async () => {
    if (typeof runCli !== "function") {
      expect(runCli).toBeTypeOf("function");
      return;
    }
    const failures: string[] = [];
    const files = premiumPayloads();
    const credentialExit = await runCli({
      args: [],
      projectId: "test-project",
      files,
      version: premiumVersion(files),
      initializeDatabase: () => {
        throw new Error("credential setup failed");
      },
      discoverRetentionSources: async () => undefined,
      publish: async () => {
        throw new Error("publisher should not run");
      },
      log: () => {},
      reportError: (message) => failures.push(message),
    });
    const publishExit = await runCli({
      args: ["--dry-run"],
      projectId: "test-project",
      files,
      version: premiumVersion(files),
      initializeDatabase: () => null,
      discoverRetentionSources: async () => undefined,
      publish: async () => {
        throw new Error("publish failed");
      },
      log: () => {},
      reportError: (message) => failures.push(message),
    });

    expect(credentialExit).toBe(1);
    expect(publishExit).toBe(1);
    expect(failures).toEqual(["credential setup failed", "publish failed"]);
  });

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
      runTransaction: async () => {
        throw new Error("dry run accessed a transaction");
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
    const snapshotDir = testSnapshotDir();
    const staleSnapshot = path.join(snapshotDir, "..", "premium-previous", "eeeeeeeeeeeeeeee");
    fs.mkdirSync(staleSnapshot, { recursive: true });
    const db = fakeFilesDb(writes, deletes);
    await publishPremium(
      { db, dryRun: false, files, version, retentionSources: retentionSources("old-5"), snapshotDir } as Parameters<typeof publishPremium>[0],
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
    expect(fs.existsSync(staleSnapshot)).toBe(false);
  });

  it("deletes no older version when the live version cannot be read", async () => {
    const writes: Write[] = [];
    const deletes: unknown[] = [];
    const lines: string[] = [];
    const files = premiumPayloads();
    const version = premiumVersion(files);
    const snapshotDir = testSnapshotDir();
    await publishPremium(
      { db: fakeFilesDb(writes, deletes), dryRun: false, files, version, snapshotDir, discoverRetentionSources: async () => undefined } as Parameters<typeof publishPremium>[0],
      (line) => lines.push(line)
    );
    expect(writes.length).toBe(PREMIUM_ARTEFACT_NAMES.length + 1);
    expect(deletes).toEqual([]);
    expect(lines).toContain(
      "retention sources could not be read, so no older version is deleted"
    );
  });

  it("retains canonical, deployed and pending pull request versions", async () => {
    const writes: Write[] = [];
    const deletes: unknown[] = [];
    const files = premiumPayloads();
    const existing = [
      { version: "recent-a", createdAt: 8 },
      { version: "recent-b", createdAt: 7 },
      { version: "recent-c", createdAt: 6 },
      { version: "recent-d", createdAt: 5 },
      { version: "canonical", createdAt: 4 },
      { version: "deployed", createdAt: 3 },
      { version: "pending", createdAt: 2 },
      { version: "orphan", createdAt: 1 },
    ];
    const options = {
      db: fakeFilesDb(writes, deletes, existing),
      dryRun: false,
      files,
      version: premiumVersion(files),
      retentionSources: {
        canonicalMainVersion: "canonical",
        deployedVersion: "deployed",
        pendingPullRequestVersions: ["pending"],
      },
      snapshotDir: testSnapshotDir(),
    } as Parameters<typeof publishPremium>[0];

    await publishPremium(options, () => {});

    expect(deletes).toEqual([{ path: "premiumData/orphan", documentReference: true }]);
  });

  it("blocks a second publisher before listing until the first publish releases the lock", async () => {
    const listedVersions: string[][] = [];
    const writes: Write[] = [];
    const deletes: string[] = [];
    const manifests = new Map<string, unknown>();
    const enteredFirstList = deferred();
    const resumeFirstList = deferred();
    const existing = Array.from({ length: 5 }, (_, index) => ({
      version: `old-${index}`,
      createdAt: 0,
    }));
    let lock: Record<string, unknown> | undefined;
    const db = {
      collection: () => ({
        listDocuments: async () => {
          const versions = existing.map(({ version }) => version).concat([...manifests.keys()]);
          listedVersions.push(versions);
          if (listedVersions.length === 1) {
            enteredFirstList.resolve();
            await resumeFirstList.promise;
          }
          return versions.map((version) => ({
            id: version,
            get: async () => ({ exists: true, get: () => Timestamp.fromMillis(manifests.has(version) ? 2 : 1) }),
          }));
        },
      }),
      doc: (path: string) => ({
        ref: { path },
        set: async (data: unknown) => {
          writes.push({ path, data });
          const match = /^premiumData\/([0-9a-f]{16})$/.exec(path);
          if (match) manifests.set(match[1], data);
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
          if (lock !== undefined) throw new Error("lock already exists");
          lock = data;
        },
        delete: () => {
          lock = undefined;
        },
      }),
    };
    const publish = (seed: string) => {
      const files = Object.fromEntries(PREMIUM_ARTEFACT_NAMES.map((name) => [name, `${seed}:${name}`]));
      return publishPremium({
        db,
        dryRun: false,
        files,
        version: premiumVersion(files),
        retentionSources: {
          canonicalMainVersion: "old-0",
          deployedVersion: "deployed",
          pendingPullRequestVersions: [],
        },
        snapshotDir: testSnapshotDir(),
      } as Parameters<typeof publishPremium>[0], () => {});
    };

    const firstPublish = publish("first");
    await enteredFirstList.promise;
    const secondAttempt = await publish("second").then(() => undefined, (error) => error);
    const writesBeforeResume = [...writes];
    const deletesBeforeResume = [...deletes];
    resumeFirstList.resolve();
    await firstPublish;

    expect(secondAttempt).toBeInstanceOf(Error);
    expect(writesBeforeResume).toEqual([]);
    expect(deletesBeforeResume).toEqual([]);
    expect(listedVersions).toHaveLength(1);
    const firstVersion = premiumVersion(Object.fromEntries(PREMIUM_ARTEFACT_NAMES.map((name) => [name, `first:${name}`])));
    expect(manifests.has(firstVersion)).toBe(true);

    await publish("second");

    expect(listedVersions).toHaveLength(2);
    expect(listedVersions[1]).toContain(firstVersion);
    expect(deletes).not.toContain(`premiumData/${firstVersion}`);
  });

  it("keeps a complete same-version manifest visible while artefacts are rewritten", async () => {
    const files = premiumPayloads();
    const version = premiumVersion(files);
    const originalManifest = {
      createdAt: Timestamp.fromMillis(1),
      artefacts: Object.fromEntries(PREMIUM_ARTEFACT_NAMES.map((name) => [name, sha256Hex(files[name])])),
    };
    let manifest: unknown = originalManifest;
    const enteredArtefact = deferred();
    const resumeArtefact = deferred();
    let paused = false;
    const writes: Write[] = [];
    const db = fakeFilesDb(writes, [], [{ version, createdAt: 1 }], {
      afterWrite: async (writePath, data) => {
        if (!paused && writePath.includes("/artefacts/")) {
          paused = true;
          enteredArtefact.resolve();
          await resumeArtefact.promise;
        }
        if (writePath === `premiumData/${version}`) manifest = data;
      },
    });
    const publish = publishPremium({
      db,
      dryRun: false,
      files,
      version,
      retentionSources: {
        canonicalMainVersion: "main",
        deployedVersion: "deployed",
        pendingPullRequestVersions: [],
      },
      snapshotDir: testSnapshotDir(),
    } as Parameters<typeof publishPremium>[0], () => {});

    await enteredArtefact.promise;
    expect(manifest).toEqual(originalManifest);
    resumeArtefact.resolve();
    await publish;

    expect(manifest).toEqual(expect.objectContaining({
      artefacts: Object.fromEntries(PREMIUM_ARTEFACT_NAMES.map((name) => [name, sha256Hex(files[name])])),
    }));
  });

  it("does no listing or writes while another owner holds the publication lock", async () => {
    const writes: Write[] = [];
    const deletes: unknown[] = [];
    const db = fakeFilesDb(writes, deletes);
    db.setLock({ owner: "existing-owner", host: "publisher", pid: 1, acquiredAt: "now" });
    const files = premiumPayloads();

    await expect(publishPremium({
      db,
      dryRun: false,
      files,
      version: premiumVersion(files),
      retentionSources: retentionSources("main"),
      snapshotDir: testSnapshotDir(),
    }, () => {})).rejects.toThrow(/lock/i);

    expect(db.listCount()).toBe(0);
    expect(writes).toEqual([]);
    expect(deletes).toEqual([]);
    expect(db.lockOwner()).toBe("existing-owner");
  });

  it("does not release a lock whose owner changed during a publish", async () => {
    const writes: Write[] = [];
    const files = premiumPayloads();
    const db = fakeFilesDb(writes, [], undefined, {
      afterWrite: (writePath, _data, setLock) => {
        if (writePath.includes("/artefacts/")) setLock({ owner: "replacement-owner" });
      },
    });

    await expect(publishPremium({
      db,
      dryRun: false,
      files,
      version: premiumVersion(files),
      retentionSources: retentionSources("main"),
      snapshotDir: testSnapshotDir(),
    }, () => {})).rejects.toThrow(/owner/i);

    expect(db.lockOwner()).toBe("replacement-owner");
  });

  it.each([
    ["an artefact write", { failWrite: true }],
    ["pruning", { failDelete: true }],
  ])("releases its own lock after %s fails", async (_name, hooks) => {
    const writes: Write[] = [];
    const existing = ["old-0", "old-1", "old-2", "old-3", "old-4", "main"].map((version) => ({
      version,
      createdAt: 0,
    }));
    const db = fakeFilesDb(writes, [], existing, hooks);
    const files = premiumPayloads();

    await expect(publishPremium({
      db,
      dryRun: false,
      files,
      version: premiumVersion(files),
      retentionSources: {
        canonicalMainVersion: "main",
        deployedVersion: "deployed",
        pendingPullRequestVersions: [],
      },
      snapshotDir: testSnapshotDir(),
    } as Parameters<typeof publishPremium>[0], () => {})).rejects.toThrow();

    expect(db.lockOwner()).toBeUndefined();
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
    const dir = testSnapshotDir();
    const files = premiumPayloads();
    const writes: Write[] = [];
    const db = fakeFilesDb(writes, [], undefined, { failWrite: true });
    await expect(publishPremium({ db, dryRun: false, files, version: premiumVersion(files), retentionSources: retentionSources("main"), snapshotDir: dir } as Parameters<typeof publishPremium>[0], () => {})).rejects.toThrow("write failed");
    expect(writes.some((write) => write.path === `premiumData/${premiumVersion(files)}`)).toBe(false);
    expect(fs.existsSync(path.join(dir, "..", "premium-previous", premiumVersion(files)))).toBe(false);
    expect(db.lockOwner()).toBeUndefined();
  });

  it("reads the canonical main version while the checkout has newer data", () => {
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
      git("remote", "add", "origin", "https://github.com/chase-mew/pokemon-tcg-pocket-tier-list.git");
      git("remote", "add", "pocketdecks", "https://github.com/PocketDecks/pokemon-tcg-pocket-tier-list.git");
      const published = Object.fromEntries(PREMIUM_ARTEFACT_NAMES.map((name) => [name, `published:${name}`]));
      const publishedVersion = premiumVersion(published);
      const unmerged = Object.fromEntries(PREMIUM_ARTEFACT_NAMES.map((name) => [name, `unmerged:${name}`]));
      const unmergedVersion = premiumVersion(unmerged);
      commitVersion(publishedVersion);
      git("update-ref", "refs/remotes/pocketdecks/main", "HEAD");
      commitVersion(unmergedVersion);
      const liveVersion = readPremiumVersionAtRef(repo);
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

  it("returns no live version when canonical main is unavailable", () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "live-version-none-"));
    try {
      execFileSync("git", ["init", "-q"], { cwd: repo, stdio: "ignore" });
      expect(readPremiumVersionAtRef(repo)).toBeUndefined();
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it.each(["{", '{ "premium": "deadbeef" }'])("reports an unreadable canonical main premium value", (contents) => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "live-version-invalid-"));
    const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", ...args], { cwd: repo, stdio: "ignore" });
    try {
      git("init", "-q");
      git("remote", "add", "pocketdecks", "https://github.com/PocketDecks/pokemon-tcg-pocket-tier-list.git");
      fs.mkdirSync(path.join(repo, "public/data"), { recursive: true });
      fs.writeFileSync(path.join(repo, "public/data/data-version.json"), contents);
      git("add", "-A"); git("commit", "-q", "-m", "invalid"); git("update-ref", "refs/remotes/pocketdecks/main", "HEAD");
      expect(readPremiumVersionAtRef(repo)).toBeUndefined();
    } finally { fs.rmSync(repo, { recursive: true, force: true }); }
  });
});
