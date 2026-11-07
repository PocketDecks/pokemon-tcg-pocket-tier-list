import path from "node:path";

import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

import { readProjectId } from "../src/utils/premium-files";
import { parseGrantArgs, planPremiumGrant } from "../src/utils/premium-grant";

const repoRoot = path.resolve(__dirname, "../..");

const run = async (): Promise<void> => {
  const args = parseGrantArgs(process.argv.slice(2));
  const plan = planPremiumGrant({
    uid: args.uid,
    until: args.until,
    source: args.source,
    revoke: args.revoke,
    now: new Date(),
  });
  const projectId = readProjectId(path.join(repoRoot, ".firebaserc"));
  const { data } = plan;

  const summary = [
    `${args.revoke ? "revoke" : "grant"} ${plan.path} in ${projectId}`,
    `  premium: ${data.premium}`,
    `  source: ${data.source}`,
    `  expiresAt: ${data.expiresAt ? data.expiresAt.toISOString() : "none"}`,
  ].join("\n");

  if (args.dryRun) {
    console.log(`Dry run, nothing written\n${summary}`);
    return;
  }

  initializeApp({ projectId, credential: applicationDefault() });
  const db = getFirestore();
  await db.doc(plan.path).set({
    premium: data.premium,
    source: data.source,
    ...(data.expiresAt ? { expiresAt: Timestamp.fromDate(data.expiresAt) } : {}),
    updatedAt: Timestamp.fromDate(data.updatedAt),
  });
  console.log(`Done\n${summary}`);
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
