import { readFile } from "node:fs/promises";
import { UpstreamError } from "../src/errors";
import { createFirestoreClient } from "../src/firestore";
import { createTokenProvider, parseServiceAccount, type ServiceAccount } from "../src/google-auth";
import { grantManually, ManualGrantRefusal, type ManualGrantOutcome } from "../src/manual-grant";
import { parseGrantArgs, USAGE, UsageError } from "./grant-args";

const loadServiceAccount = async (path: string): Promise<ServiceAccount> => {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    throw new UsageError("The key file could not be read");
  }
  try {
    return parseServiceAccount(text);
  } catch {
    throw new UsageError("The key file is not a service account JSON key");
  }
};

const describeExpiry = (date: Date | null, fallback: string): string =>
  date ? date.toISOString() : fallback;

const report = (outcome: ManualGrantOutcome): string => {
  const lines = [
    outcome.dryRun ? "Dry run: nothing was written" : "Grant written",
    `payment: ${outcome.paymentId}`,
    `uid: ${outcome.uid}`,
    `months: ${outcome.months}`,
    `result: ${outcome.status}`,
    `old expiry: ${describeExpiry(outcome.previousExpiry, "none")}`,
    `new expiry: ${outcome.status === "granted" ? describeExpiry(outcome.newExpiry, "none") : "unchanged (lifetime)"}`,
  ];
  return lines.join("\n");
};

const main = async (): Promise<number> => {
  let args;
  try {
    args = parseGrantArgs(process.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`${error.message}\n\n${USAGE}`);
      return 2;
    }
    throw error;
  }
  if (args.help) {
    console.log(USAGE);
    return 0;
  }

  try {
    const account = await loadServiceAccount(args.keyPath);
    const getToken = createTokenProvider({ serviceAccount: account, fetch });
    const client = createFirestoreClient({
      projectId: account.projectId,
      getToken,
      onUnauthorised: getToken.invalidate,
      fetch,
    });
    const outcome = await grantManually({
      client,
      paymentId: args.paymentId,
      uid: args.uid,
      months: args.months,
      dryRun: args.dryRun,
      now: new Date(),
    });
    console.log(report(outcome));
    return 0;
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(error.message);
      return 2;
    }
    if (error instanceof ManualGrantRefusal) {
      console.error(`Refused: ${error.message}`);
      return 1;
    }
    const cause =
      error instanceof UpstreamError ? error.message : error instanceof Error ? error.name : "unknown";
    console.error(`Grant failed: ${cause}. A rerun is safe, because it checks the payment status again.`);
    return 1;
  }
};

process.exitCode = await main();
