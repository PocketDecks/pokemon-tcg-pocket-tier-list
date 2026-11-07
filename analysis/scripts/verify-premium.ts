import path from "node:path";

import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { PREMIUM_ARTEFACT_NAMES } from "../src/utils/premium-artefacts";
import { readCommittedVersion, readProjectId } from "../src/utils/premium-files";
import { PremiumSnapshot, checkPremiumVersion } from "../src/utils/premium-verify";
import {
  ARTEFACT_SUBCOLLECTION,
  PREMIUM_COLLECTION,
} from "../src/utils/premium-upload";

const repoRoot = path.resolve(__dirname, "../..");

const run = async (): Promise<void> => {
  const version = readCommittedVersion(path.join(repoRoot, "public/data/data-version.json"));
  const projectId = readProjectId(path.join(repoRoot, ".firebaserc"));

  initializeApp({ projectId, credential: applicationDefault() });
  const db = getFirestore();

  const versionDoc = await db.doc(`${PREMIUM_COLLECTION}/${version}`).get();
  const snapshot: PremiumSnapshot = {
    version,
    versionDocument: versionDoc.exists
      ? { artefacts: (versionDoc.get("artefacts") ?? {}) as Record<string, string> }
      : null,
    artefacts: {},
  };

  if (versionDoc.exists) {
    for (const name of PREMIUM_ARTEFACT_NAMES) {
      const doc = await db
        .doc(`${PREMIUM_COLLECTION}/${version}/${ARTEFACT_SUBCOLLECTION}/${name}`)
        .get();
      snapshot.artefacts[name] = doc.exists
        ? { payload: String(doc.get("payload")), sha256: String(doc.get("sha256")) }
        : null;
    }
  }

  const problems = checkPremiumVersion(snapshot);
  if (problems.length) {
    for (const problem of problems) console.error(problem);
    process.exit(1);
  }
  console.log(`premium version ${version} is complete in ${projectId}`);
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
