import { handleAdminGrant } from "./admin-grant";
import { readBody } from "./body";
import { extractCode } from "./codes";
import { decideGrant, type PaymentStatus } from "./decision";
import { entitlementPath, entitlementWrite, isSafeUid, toEntitlement } from "./entitlement";
import { describeFailure } from "./errors";
import {
  createFirestoreClient,
  type DocumentWrite,
  type FieldValue,
  type FirestoreClient,
} from "./firestore";
import { createTokenProvider, parseServiceAccount } from "./google-auth";
import { monthKey, monthsForPayment } from "./months";
import { parseKofiPayload, type KofiPayment } from "./payload";
import { tokensMatch } from "./token";

export interface Env {
  KOFI_VERIFICATION_TOKEN: string;
  FIREBASE_SERVICE_ACCOUNT: string;
  KOFI_ADMIN_TOKEN?: string;
}

export interface ReceiverDeps {
  fetch: typeof fetch;
  now: () => Date;
}

interface Match {
  uid: string;
  matchedBy: "code" | "email";
}

const PREMIUM_TYPES = new Set(["Donation", "Subscription"]);
const MIN_ADMIN_TOKEN_LENGTH = 32;
const MAX_TIMESTAMP_SKEW_MS = 2 * 24 * 60 * 60 * 1000;

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

const truncate = (value: string, limit: number): string => {
  const wellFormed = value.replace(LONE_SURROGATE, "\uFFFD");
  const characters = Array.from(wellFormed);
  return characters.length > limit ? characters.slice(0, limit).join("") : wellFormed;
};

const reply = (status: number, body: string): Response =>
  new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

const findMatch = async (client: FirestoreClient, payment: KofiPayment): Promise<Match | null> => {
  const code = extractCode(payment.message);
  if (code) {
    const document = await client.getDocument(`premiumCodes/${code}`);
    if (document && isSafeUid(document.uid)) {
      if (await client.hasActiveAccount(document.uid)) {
        return { uid: document.uid, matchedBy: "code" };
      }
    }
  }
  const email = payment.email.trim().toLowerCase();
  if (email) {
    const uid = await client.lookupUidByEmail(email);
    if (uid) return { uid, matchedBy: "email" };
  }
  return null;
};

const paymentDateFor = (timestamp: string, now: Date): Date => {
  const reported = new Date(timestamp);
  const skew = Math.abs(reported.getTime() - now.getTime());
  return Number.isNaN(skew) || skew > MAX_TIMESTAMP_SKEW_MS ? now : reported;
};

/**
 * What a payment is worth and what it needs in Firestore. A grant opens a
 * transaction, so `transaction` is set whenever a match was found and the
 * caller must either record it or roll it back.
 */
interface Classification {
  status: PaymentStatus;
  match: Match | null;
  months: number;
  countsAsTip: boolean;
  grantWrite: DocumentWrite | null;
  transaction?: string;
}

/**
 * Decides the payment's status. It reads Firestore (the account lookup and
 * the current entitlement) but writes nothing. If it opens a transaction and
 * then fails, it rolls that transaction back before rethrowing.
 */
const classifyPayment = async (
  client: FirestoreClient,
  payment: KofiPayment,
  now: Date,
): Promise<Classification> => {
  const countsAsTip = PREMIUM_TYPES.has(payment.type) && payment.currency.toUpperCase() === "GBP";
  const months = countsAsTip ? monthsForPayment(payment.amountPence) : 0;
  const base = { months, countsAsTip, match: null, grantWrite: null };
  if (months === 0) return { ...base, status: "needs-review" };

  const match = await findMatch(client, payment);
  if (!match) return { ...base, status: "unmatched" };

  const transaction = await client.beginTransaction();
  try {
    const existing = toEntitlement(await client.getDocument(entitlementPath(match.uid), transaction));
    const decision = decideGrant({ months, existing, now });
    if (decision.status === "granted") {
      return {
        ...base,
        match,
        status: "granted",
        grantWrite: entitlementWrite(match.uid, decision.expiresAt, "kofi", now),
        transaction,
      };
    }
    return { ...base, match, status: "already-lifetime", transaction };
  } catch (error) {
    await client.rollback(transaction).catch(() => undefined);
    throw error;
  }
};

/**
 * Writes the payment record, the grant (if any) and the tip total in one
 * commit. Returns true when the payment was already recorded.
 */
const recordPayment = async (
  client: FirestoreClient,
  payment: KofiPayment,
  classification: Classification,
  now: Date,
): Promise<boolean> => {
  const { status, match, months, countsAsTip, grantWrite, transaction } = classification;
  try {
    const fields: Record<string, FieldValue> = {
      type: truncate(payment.type, 32),
      amountPence: payment.amountPence,
      currency: truncate(payment.currency.toUpperCase(), 8),
      months,
      status,
      receivedAt: now,
      kofiTimestamp: truncate(payment.timestamp, 64),
      isSubscriptionPayment: payment.isSubscriptionPayment,
    };
    if (match) {
      fields.uid = match.uid;
      fields.matchedBy = match.matchedBy;
    }
    if (status !== "granted") {
      fields.email = truncate(payment.email, 320);
      fields.fromName = truncate(payment.fromName, 200);
      fields.message = truncate(payment.message, 500);
    }

    const writes: DocumentWrite[] = [
      { kind: "create", path: `kofiPayments/${payment.id}`, fields },
    ];
    if (grantWrite) writes.push(grantWrite);
    if (countsAsTip) {
      writes.push({
        kind: "increment",
        path: `tipTotals/${monthKey(paymentDateFor(payment.timestamp, now))}`,
        increments: { amountPence: payment.amountPence, count: 1 },
      });
    }

    const result = await client.commit(writes, transaction);
    if (result === "duplicate" && transaction !== undefined) {
      await client.rollback(transaction).catch(() => undefined);
    }
    return result === "duplicate";
  } catch (error) {
    if (transaction !== undefined) {
      await client.rollback(transaction).catch(() => undefined);
    }
    throw error;
  }
};

const processPayment = async (
  client: FirestoreClient,
  payment: KofiPayment,
  now: Date,
): Promise<{ status: PaymentStatus; duplicate: boolean }> => {
  const classification = await classifyPayment(client, payment, now);
  const duplicate = await recordPayment(client, payment, classification, now);
  return { status: classification.status, duplicate };
};

export const createReceiver = (deps: ReceiverDeps) => {
  let cache: { secret: string; client: FirestoreClient } | null = null;

  const clientFor = (secret: string): FirestoreClient => {
    if (cache && cache.secret === secret) return cache.client;
    const serviceAccount = parseServiceAccount(secret);
    const getToken = createTokenProvider({
      serviceAccount,
      fetch: deps.fetch,
      now: () => deps.now().getTime(),
    });
    const client = createFirestoreClient({
      projectId: serviceAccount.projectId,
      getToken,
      onUnauthorised: getToken.invalidate,
      fetch: deps.fetch,
    });
    cache = { secret, client };
    return client;
  };

  return async (request: Request, env: Env): Promise<Response> => {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/admin/grant") {
      const adminToken = env.KOFI_ADMIN_TOKEN ?? "";
      if (adminToken.length < MIN_ADMIN_TOKEN_LENGTH) return reply(404, "Not found");
      return handleAdminGrant(request, {
        adminToken,
        client: () => clientFor(env.FIREBASE_SERVICE_ACCOUNT),
        now: deps.now(),
      });
    }
    if (request.method !== "POST" || url.pathname !== "/kofi") return reply(404, "Not found");

    const body = await readBody(request);
    if (body === null) return reply(413, "Payload too large");

    const payment = parseKofiPayload(body);
    if (!payment) return reply(400, "Malformed request");

    if (!tokensMatch(env.KOFI_VERIFICATION_TOKEN ?? "", payment.verificationToken)) {
      return reply(401, "Unauthorised");
    }

    try {
      const client = clientFor(env.FIREBASE_SERVICE_ACCOUNT);
      const outcome = await processPayment(client, payment, deps.now());
      console.log(
        `kofi payment ${payment.id} ${outcome.duplicate ? "duplicate" : outcome.status}`,
      );
      return reply(200, outcome.duplicate ? "Duplicate" : "OK");
    } catch (error) {
      console.error(`kofi payment ${payment.id} failed: ${describeFailure(error)}`);
      return reply(500, "Upstream failure");
    }
  };
};
