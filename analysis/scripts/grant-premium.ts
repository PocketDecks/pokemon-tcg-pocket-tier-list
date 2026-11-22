import path from "node:path";

import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

import { readProjectId } from "../src/utils/premium-files";
import {
  parseGrantArgs,
  planPremiumGrant,
  type PremiumGrantPlan,
} from "../src/utils/premium-grant";

const repoRoot = path.resolve(__dirname, "../..");

const accountEmail = async (uid: string): Promise<string | undefined> => {
  try {
    const { email } = await getAuth().getUser(uid);
    return email ? email.toLowerCase() : undefined;
  } catch (error) {
    if ((error as { code?: string }).code === "auth/user-not-found") {
      throw new Error(`no account exists for uid ${uid}`, { cause: error });
    }
    throw error;
  }
};

const summarise = (
  plan: PremiumGrantPlan,
  verb: string,
  projectId: string,
  emailLine: string
): string =>
  [
    `${verb} ${plan.path} in ${projectId}`,
    `  premium: ${plan.data.premium}`,
    `  source: ${plan.data.source}`,
    `  expiresAt: ${plan.data.expiresAt ? plan.data.expiresAt.toISOString() : "none"}`,
    emailLine,
  ].join("\n");

const run = async (): Promise<void> => {
  const args = parseGrantArgs(process.argv.slice(2));
  const request = {
    uid: args.uid,
    until: args.until,
    source: args.source,
    revoke: args.revoke,
    now: new Date(),
  };
  const preview = planPremiumGrant(request);
  const projectId = readProjectId(path.join(repoRoot, ".firebaserc"));
  const verb = args.revoke ? "revoke" : "grant";

  if (args.dryRun) {
    const emailLine = args.revoke ? "  email: unchanged" : "  email: read from the account when written";
    console.log(`Dry run, nothing written\n${summarise(preview, verb, projectId, emailLine)}`);
    return;
  }

  process.env.GOOGLE_CLOUD_QUOTA_PROJECT ??= projectId;
  initializeApp({ projectId, credential: applicationDefault() });
  const email = args.revoke ? undefined : await accountEmail(args.uid);
  const plan = planPremiumGrant({ ...request, email });
  const { data } = plan;

  await getFirestore()
    .doc(plan.path)
    .set(
      {
        premium: data.premium,
        source: data.source,
        expiresAt: data.expiresAt ? Timestamp.fromDate(data.expiresAt) : null,
        updatedAt: Timestamp.fromDate(data.updatedAt),
        ...(data.email ? { email: data.email } : {}),
      },
      { merge: true }
    );
  const emailLine = data.email ? `  email: ${data.email}` : "  email: unchanged";
  console.log(`Done\n${summarise(plan, verb, projectId, emailLine)}`);
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
