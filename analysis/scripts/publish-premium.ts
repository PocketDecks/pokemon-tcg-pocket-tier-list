import path from "node:path";

import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

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

const repoRoot = path.resolve(__dirname, "../..");
const dryRun = process.argv.includes("--dry-run");

const run = async (): Promise<void> => {
  const files = loadPremiumFiles(PREMIUM_DIR);
  const version = readCommittedVersion(path.join(repoRoot, "public/data/data-version.json"));
  assertVersionMatches(files, version);
  const projectId = readProjectId(path.join(repoRoot, ".firebaserc"));

  if (dryRun) {
    const plan = planPremiumUpload({ files, version, existing: [] });
    console.log(`Dry run for project ${projectId}, version ${version}`);
    for (const write of plan.artefactWrites) {
      console.log(`  write ${write.path} (${Buffer.byteLength(write.data.payload, "utf8")} bytes)`);
    }
    console.log(`  write ${plan.versionWrite.path}`);
    console.log("  pruning is decided against the live collection, so it is not shown");
    return;
  }

  initializeApp({ projectId, credential: applicationDefault() });
  const db = getFirestore();

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
    console.log(`wrote ${write.path}`);
  }
  await db.doc(plan.versionWrite.path).set({
    createdAt: Timestamp.now(),
    artefacts: plan.versionWrite.data.artefacts,
  });
  console.log(`wrote ${plan.versionWrite.path}`);

  for (const old of plan.deleteVersions) {
    await db.recursiveDelete(db.doc(`${PREMIUM_COLLECTION}/${old}`));
    console.log(`deleted ${PREMIUM_COLLECTION}/${old}`);
  }
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
