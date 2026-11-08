import { decideGrant } from "./decision";
import { SAFE_UID, toEntitlement } from "./entitlement";
import type { DocumentWrite, FirestoreClient } from "./firestore";
import { MAX_MONTHS } from "./months";

export class ManualGrantRefusal extends Error {}

export interface ManualGrantInput {
  client: FirestoreClient;
  paymentId: string;
  uid: string;
  months?: number;
  dryRun: boolean;
  now: Date;
}

export interface ManualGrantOutcome {
  paymentId: string;
  uid: string;
  months: number;
  status: "granted" | "already-lifetime";
  previousExpiry: Date | null;
  newExpiry: Date | null;
  dryRun: boolean;
}

const SAFE_PAYMENT_ID = /^[A-Za-z0-9_-]{1,200}$/;
const RESERVED_ID = /^__.*__$/;
const GRANTABLE = new Set(["unmatched", "needs-review"]);

const isValidMonths = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_MONTHS;

const refuse = (message: string): never => {
  throw new ManualGrantRefusal(message);
};

const checkInputs = (input: ManualGrantInput): void => {
  if (!SAFE_PAYMENT_ID.test(input.paymentId) || RESERVED_ID.test(input.paymentId)) {
    refuse("The payment id is not a valid document id");
  }
  if (!SAFE_UID.test(input.uid)) {
    refuse("The uid must be 1 to 128 letters and digits");
  }
  if (input.months !== undefined && !isValidMonths(input.months)) {
    refuse(`--months must be a whole number from 1 to ${MAX_MONTHS}`);
  }
};

const resolveMonths = (stored: unknown, requested: number | undefined): number => {
  if (isValidMonths(stored)) {
    if (requested !== undefined && requested !== stored) {
      return refuse(
        `--months ${requested} does not match the ${stored} months stored on the payment`,
      );
    }
    return stored;
  }
  if (requested === undefined) {
    return refuse(`The payment has no usable months, so pass --months (1 to ${MAX_MONTHS})`);
  }
  return requested;
};

export const grantManually = async (input: ManualGrantInput): Promise<ManualGrantOutcome> => {
  checkInputs(input);
  const { client, paymentId, uid, dryRun, now } = input;
  const paymentPath = `kofiPayments/${paymentId}`;
  const entitlementPath = `entitlements/${uid}`;

  const transaction = await client.beginTransaction();
  try {
    const payment = await client.getDocument(paymentPath, transaction);
    if (!payment) return refuse(`Payment ${paymentId} does not exist`);
    if (typeof payment.status !== "string" || !GRANTABLE.has(payment.status)) {
      return refuse(
        `Payment ${paymentId} has status ${String(payment.status)}, and only unmatched or needs-review payments can be granted`,
      );
    }
    const months = resolveMonths(payment.months, input.months);

    if (!(await client.hasActiveAccount(uid))) {
      return refuse(`No active account exists for uid ${uid}`);
    }

    const existing = toEntitlement(await client.getDocument(entitlementPath, transaction));
    const decision = decideGrant({ months, existing, now });
    const previousExpiry =
      existing?.premium && existing.expiresAtMs !== null ? new Date(existing.expiresAtMs) : null;

    const outcome: ManualGrantOutcome = {
      paymentId,
      uid,
      months,
      status: decision.status,
      previousExpiry,
      newExpiry: decision.status === "granted" ? decision.expiresAt : null,
      dryRun,
    };

    if (dryRun) {
      await client.rollback(transaction).catch(() => undefined);
      return outcome;
    }

    const writes: DocumentWrite[] = [];
    if (decision.status === "granted") {
      writes.push({
        kind: "merge",
        path: entitlementPath,
        fields: { premium: true, source: "kofi", expiresAt: decision.expiresAt, updatedAt: now },
      });
    }
    writes.push({
      kind: "merge",
      path: paymentPath,
      fields: { status: decision.status, uid, matchedBy: "manual", months, grantedAt: now },
    });
    await client.commit(writes, transaction);
    return outcome;
  } catch (error) {
    await client.rollback(transaction).catch(() => undefined);
    throw error;
  }
};

export const resolveGrantUid = async (
  client: FirestoreClient,
  target: { uid?: string; email?: string },
): Promise<string | null> => {
  if (target.uid !== undefined) return target.uid;
  if (target.email === undefined) return null;
  const uid = await client.lookupUidByEmail(target.email.trim().toLowerCase());
  return uid && uid.length <= 128 && !uid.includes("/") ? uid : null;
};
