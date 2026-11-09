import path from "node:path";

import { applicationDefault, initializeApp } from "firebase-admin/app";
import { Firestore, getFirestore } from "firebase-admin/firestore";

import { PREMIUM_ARTEFACT_NAMES } from "../src/utils/premium-artefacts";
import { readCommittedVersion, readProjectId } from "../src/utils/premium-files";
import { PremiumSnapshot, checkPremiumVersion } from "../src/utils/premium-verify";
import {
  ARTEFACT_SUBCOLLECTION,
  PREMIUM_COLLECTION,
} from "../src/utils/premium-upload";

export interface VerifyDb {
  doc(path: string): {
    get(): Promise<{
      exists: boolean;
      get(field: string): unknown;
    }>;
  };
}

const adapt = (firestore: Firestore): VerifyDb => ({
  doc: (path) => ({
    get: () => firestore.doc(path).get() as never,
  }),
});

export const verifyPremium = async (
  {
    db,
    version: injectedVersion,
    projectId: injectedProjectId,
  }: { db: VerifyDb; version?: string; projectId?: string },
  log: (line: string) => void = console.log,
  fail: (line: string) => void = (line) => {
    console.error(line);
  }
): Promise<void> => {
  const repoRoot = path.resolve(__dirname, "../..");
  const version =
    injectedVersion ??
    readCommittedVersion(path.join(repoRoot, "public/data/data-version.json"));
  const projectId =
    injectedProjectId ?? readProjectId(path.join(repoRoot, ".firebaserc"));

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
    for (const problem of problems) fail(problem);
    throw new Error(`premium version ${version} is not complete in ${projectId}`);
  }
  log(`premium version ${version} is complete in ${projectId}`);
};

export const runVerifyPremium = (
  options: { db: VerifyDb; version?: string; projectId?: string },
  exit: (code: number) => void = process.exit
): Promise<void> =>
  verifyPremium(options).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    exit(1);
  });

if (require.main === module) {
  const repoRoot = path.resolve(__dirname, "../..");
  const projectId = readProjectId(path.join(repoRoot, ".firebaserc"));
  initializeApp({ projectId, credential: applicationDefault() });
  const db = adapt(getFirestore());
  void runVerifyPremium({ db });
}
