import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";

import { applicationDefault, initializeApp } from "firebase-admin/app";
import { Firestore, getFirestore, Timestamp } from "firebase-admin/firestore";

import {
  loadPremiumFiles,
  readCommittedVersion,
  readProjectId,
  assertVersionMatches,
} from "../src/utils/premium-files";
import {
  PREMIUM_DIR,
  prunePremiumSnapshots,
  snapshotPremiumVersion,
} from "../src/utils/premium-artefacts";
import {
  ExistingVersion,
  planPremiumUpload,
  PREMIUM_COLLECTION,
} from "../src/utils/premium-upload";
import {
  discoverPremiumRetentionSources,
  PremiumRetentionSources,
} from "./premium-retention";

export { discoverPremiumRetentionSources };
export type { PremiumRetentionSources };

export interface PremiumTransaction {
  get(ref: unknown): Promise<{ exists: boolean; get(field: string): unknown }>;
  create(ref: unknown, data: unknown): void;
  delete(ref: unknown): void;
}

export interface PremiumDb {
  collection(name: string): { listDocuments(): Promise<{ id: string; get(): Promise<{ exists: boolean; get(field: string): unknown }> }[]> };
  doc(path: string): { ref: unknown; set(data: unknown): Promise<void> };
  recursiveDelete(ref: unknown): Promise<void>;
  runTransaction<T>(callback: (transaction: PremiumTransaction) => Promise<T>): Promise<T>;
}

const PUBLISH_LOCK = "premiumPublishLocks/global";

const acquirePublishLock = async (db: PremiumDb): Promise<string> => {
  const owner = randomUUID();
  const ref = db.doc(PUBLISH_LOCK).ref;
  const acquired = await db.runTransaction(async (transaction) => {
    const current = await transaction.get(ref);
    if (current.exists) return false;
    transaction.create(ref, {
      owner,
      host: os.hostname(),
      pid: process.pid,
      acquiredAt: new Date().toISOString(),
    });
    return true;
  });
  if (!acquired) throw new Error(`premium publication is locked at ${PUBLISH_LOCK}`);
  return owner;
};

const releasePublishLock = async (db: PremiumDb, owner: string): Promise<void> => {
  const ref = db.doc(PUBLISH_LOCK).ref;
  await db.runTransaction(async (transaction) => {
    const current = await transaction.get(ref);
    if (!current.exists) return;
    if (current.get("owner") !== owner) {
      throw new Error(`premium publication lock owner changed at ${PUBLISH_LOCK}; it was left in place`);
    }
    transaction.delete(ref);
  });
};

export const adaptPremiumDb = (firestore: Firestore): PremiumDb => ({
  collection: (name) =>
    firestore.collection(name) as unknown as PremiumDb["collection"] extends (name: string) => infer T ? T : never,
  doc: (path) => {
    const ref = firestore.doc(path);
    return {
      ref,
      set: (data: unknown) => ref.set(data as Record<string, unknown>).then(() => {}),
    };
  },
  recursiveDelete: (ref) => firestore.recursiveDelete(ref as never),
  runTransaction: (callback) => firestore.runTransaction((transaction) => callback({
    get: async (ref) => await transaction.get(ref as never) as unknown as { exists: boolean; get(field: string): unknown },
    create: (ref, data) => {
      transaction.create(ref as never, data as never);
    },
    delete: (ref) => {
      transaction.delete(ref as never);
    },
  })),
});

export const publishPremium = async (
  {
    db,
    dryRun,
    files: injectedFiles,
    version: injectedVersion,
    projectId: injectedProjectId,
    retentionSources: injectedRetentionSources,
    discoverRetentionSources: injectedDiscoverRetentionSources,
    snapshotDir,
  }: {
    db: PremiumDb | null;
    dryRun: boolean;
    files?: Record<string, string>;
    version?: string;
    projectId?: string;
    retentionSources?: PremiumRetentionSources;
    discoverRetentionSources?: () => Promise<PremiumRetentionSources | undefined>;
    snapshotDir?: string;
  },
  log: (line: string) => void = console.log
): Promise<void> => {
  const repoRoot = path.resolve(__dirname, "../..");
  const files = injectedFiles ?? loadPremiumFiles(PREMIUM_DIR);
  const version =
    injectedVersion ??
    readCommittedVersion(path.join(repoRoot, "public/data/data-version.json"));
  assertVersionMatches(files, version);
  const projectId =
    injectedProjectId ?? readProjectId(path.join(repoRoot, ".firebaserc"));

  if (dryRun || db === null) {
    const plan = planPremiumUpload({ files, version, existing: [] });
    log(
      dryRun
        ? `Dry run for project ${projectId}, version ${version}`
        : `No database configured, so nothing writes for project ${projectId}, version ${version}`
    );
    for (const write of plan.artefactWrites) {
      log(`  write ${write.path} (${Buffer.byteLength(write.data.payload, "utf8")} bytes)`);
    }
    log(`  write ${plan.versionWrite.path}`);
    log("  pruning is decided against the live collection, so it is not shown");
    return;
  }

  let sources = injectedRetentionSources;
  if (!sources) {
    try {
      sources = await (injectedDiscoverRetentionSources ?? (() => discoverPremiumRetentionSources({ repoRoot })))();
    } catch {
      sources = undefined;
    }
  }

  const owner = await acquirePublishLock(db);
  try {
    const protectedVersions = sources
      ? [sources.canonicalMainVersion, sources.deployedVersion, ...sources.pendingPullRequestVersions]
      : [];
    const documents = await db.collection(PREMIUM_COLLECTION).listDocuments();
    const existing: ExistingVersion[] = await Promise.all(documents.map(async (doc) => {
      const snapshot = await doc.get();
      const createdAt = snapshot.exists ? snapshot.get("createdAt") : undefined;
      return {
        version: doc.id,
        createdAt: createdAt instanceof Timestamp ? createdAt.toMillis() : 0,
      };
    }));

    const plan = planPremiumUpload({ files, version, existing, protectedVersions });
    for (const write of plan.artefactWrites) {
      await db.doc(write.path).set(write.data);
      log(`wrote ${write.path}`);
    }
    await db.doc(plan.versionWrite.path).set({
      createdAt: Timestamp.now(),
      artefacts: plan.versionWrite.data.artefacts,
    });
    log(`wrote ${plan.versionWrite.path}`);

    if (!sources) {
      log("retention sources could not be read, so no older version is deleted");
    } else {
      for (const old of plan.deleteVersions) {
        await db.recursiveDelete(db.doc(`${PREMIUM_COLLECTION}/${old}`).ref);
        log(`deleted ${PREMIUM_COLLECTION}/${old}`);
      }
    }
    snapshotPremiumVersion(files, version, snapshotDir);
    if (sources) prunePremiumSnapshots([...protectedVersions, version], snapshotDir);
  } finally {
    await releasePublishLock(db, owner);
  }
};

export const runPublishPremiumCli = async ({
  args = process.argv.slice(2),
  repoRoot = path.resolve(__dirname, "../.."),
  projectId: injectedProjectId,
  files: injectedFiles,
  version: injectedVersion,
  snapshotDir,
  initializeDatabase,
  discoverRetentionSources: injectedDiscoverRetentionSources,
  publish = publishPremium,
  log = console.log,
  reportError = (message: string) => console.error(message),
}: {
  args?: string[];
  repoRoot?: string;
  projectId?: string;
  files?: Record<string, string>;
  version?: string;
  snapshotDir?: string;
  initializeDatabase?: (projectId: string) => PremiumDb;
  discoverRetentionSources?: () => Promise<PremiumRetentionSources | undefined>;
  publish?: typeof publishPremium;
  log?: (line: string) => void;
  reportError?: (message: string) => void;
} = {}): Promise<number> => {
  try {
    const unknownArgument = args.find((argument) => argument !== "--dry-run");
    if (unknownArgument !== undefined) throw new Error(`unknown argument: ${unknownArgument}`);
    const dryRun = args.includes("--dry-run");
    const projectId = injectedProjectId ?? readProjectId(path.join(repoRoot, ".firebaserc"));
    const files = injectedFiles ?? loadPremiumFiles(PREMIUM_DIR);
    const version = injectedVersion ?? readCommittedVersion(path.join(repoRoot, "public/data/data-version.json"));
    const db = dryRun
      ? null
      : (initializeDatabase ?? ((id) => adaptPremiumDb(
          getFirestore(initializeApp({ projectId: id, credential: applicationDefault() }))
        )))(projectId);
    const discoverRetentionSources = dryRun
      ? undefined
      : injectedDiscoverRetentionSources ?? (() => discoverPremiumRetentionSources({ repoRoot }));
    await publish({ db, dryRun, files, version, projectId, discoverRetentionSources, snapshotDir }, log);
    return 0;
  } catch (error) {
    reportError(error instanceof Error ? error.message : String(error));
    return 1;
  }
};

if (require.main === module) {
  void runPublishPremiumCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
