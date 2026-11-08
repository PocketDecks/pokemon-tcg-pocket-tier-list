import path from "node:path";

import { applicationDefault, initializeApp } from "firebase-admin/app";
import { Firestore, getFirestore, Timestamp } from "firebase-admin/firestore";

import { PREMIUM_DIR } from "../src/utils/premium-artefacts";
import {
  assertVersionMatches,
  loadPremiumFiles,
  readCommittedVersion,
  readProjectId,
} from "../src/utils/premium-files";
import {
  ExistingVersion,
  planPremiumUpload,
  PREMIUM_COLLECTION,
} from "../src/utils/premium-upload";

export interface PremiumDb {
  collection(name: string): { get(): Promise<{ docs: { id: string; get(field: string): unknown }[] }> };
  doc(path: string): { set(data: unknown): Promise<void> };
  recursiveDelete(ref: unknown): Promise<void>;
}

const adapt = (firestore: Firestore): PremiumDb => ({
  collection: (name) =>
    firestore.collection(name) as unknown as { get(): Promise<{ docs: { id: string; get(field: string): unknown }[] }> },
  doc: (path) => ({
    set: (data) => firestore.doc(path).set(data as Record<string, unknown>).then(() => {}),
  }),
  recursiveDelete: (ref) => firestore.recursiveDelete(ref as never),
});

export const publishPremium = async (
  {
    db,
    dryRun,
    files: injectedFiles,
    version: injectedVersion,
    projectId: injectedProjectId,
  }: {
    db: PremiumDb | null;
    dryRun: boolean;
    files?: Record<string, string>;
    version?: string;
    projectId?: string;
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
    log(`Dry run for project ${projectId}, version ${version}`);
    for (const write of plan.artefactWrites) {
      log(`  write ${write.path} (${Buffer.byteLength(write.data.payload, "utf8")} bytes)`);
    }
    log(`  write ${plan.versionWrite.path}`);
    log("  pruning is decided against the live collection, so it is not shown");
    return;
  }

  const snapshot = await db.collection(PREMIUM_COLLECTION).get();
  const existing: ExistingVersion[] = snapshot.docs.map((doc) => {
    const createdAt = doc.get("createdAt");
    return {
      version: doc.id,
      createdAt: createdAt instanceof Timestamp ? createdAt.toMillis() : 0,
    };
  });

  const plan = planPremiumUpload({ files, version, existing });

  for (const write of plan.artefactWrites) {
    await db.doc(write.path).set(write.data);
    log(`wrote ${write.path}`);
  }
  await db.doc(plan.versionWrite.path).set({
    createdAt: Timestamp.now(),
    artefacts: plan.versionWrite.data.artefacts,
  });
  log(`wrote ${plan.versionWrite.path}`);

  for (const old of plan.deleteVersions) {
    await db.recursiveDelete(db.doc(`${PREMIUM_COLLECTION}/${old}`));
    log(`deleted ${PREMIUM_COLLECTION}/${old}`);
  }
};

if (require.main === module) {
  const dryRun = process.argv.includes("--dry-run");
  const repoRoot = path.resolve(__dirname, "../..");
  const projectId = readProjectId(path.join(repoRoot, ".firebaserc"));
  const db = dryRun
    ? null
    : adapt(
        getFirestore(
          initializeApp({ projectId, credential: applicationDefault() })
        )
      );
  publishPremium({ db, dryRun }).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
