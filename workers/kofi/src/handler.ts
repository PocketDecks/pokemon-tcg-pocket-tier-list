import { extractCode } from "./codes";
import { decideGrant, type ExistingEntitlement, type PaymentStatus } from "./decision";
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

const reply = (status: number, body: string): Response =>
  new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

const toEntitlement = (document: Record<string, unknown> | null): ExistingEntitlement | null => {
  if (!document) return null;
  const expiresAt = document.expiresAt;
  return {
    premium: document.premium === true,
    expiresAtMs: expiresAt instanceof Date ? expiresAt.getTime() : null,
  };
};

const findMatch = async (client: FirestoreClient, payment: KofiPayment): Promise<Match | null> => {
  const code = extractCode(payment.message);
  if (code) {
    const document = await client.getDocument(`premiumCodes/${code}`);
    if (document && typeof document.uid === "string" && document.uid) {
      return { uid: document.uid, matchedBy: "code" };
    }
  }
  if (payment.email) {
    const uid = await client.lookupUidByEmail(payment.email);
    if (uid) return { uid, matchedBy: "email" };
  }
  return null;
};

const processPayment = async (
  client: FirestoreClient,
  payment: KofiPayment,
  now: Date,
): Promise<{ status: PaymentStatus; duplicate: boolean }> => {
  const months = PREMIUM_TYPES.has(payment.type)
    ? monthsForPayment(payment.amountPence, payment.currency)
    : 0;
  const kofiDate = new Date(payment.timestamp);
  const paymentDate = Number.isNaN(kofiDate.getTime()) ? now : kofiDate;

  let status: PaymentStatus = "needs-review";
  let match: Match | null = null;
  let transaction: string | undefined;
  let entitlementWrite: DocumentWrite | null = null;

  if (months > 0) {
    match = await findMatch(client, payment);
    if (!match) {
      status = "unmatched";
    } else {
      transaction = await client.beginTransaction();
      const existing = toEntitlement(
        await client.getDocument(`entitlements/${match.uid}`, transaction),
      );
      const decision = decideGrant({ months, existing, now });
      if (decision.status === "granted") {
        status = "granted";
        entitlementWrite = {
          kind: "merge",
          path: `entitlements/${match.uid}`,
          fields: {
            premium: true,
            source: "kofi",
            expiresAt: decision.expiresAt,
            updatedAt: now,
          },
        };
      } else {
        status = "already-lifetime";
      }
    }
  }

  const fields: Record<string, FieldValue> = {
    type: payment.type,
    amountPence: payment.amountPence,
    currency: payment.currency.toUpperCase(),
    months,
    status,
    receivedAt: now,
    kofiTimestamp: payment.timestamp,
    isSubscriptionPayment: payment.isSubscriptionPayment,
  };
  if (match) {
    fields.uid = match.uid;
    fields.matchedBy = match.matchedBy;
  }
  if (status !== "granted") {
    fields.email = payment.email;
    fields.fromName = payment.fromName;
  }

  const writes: DocumentWrite[] = [
    { kind: "create", path: `kofiPayments/${payment.id}`, fields },
  ];
  if (entitlementWrite) writes.push(entitlementWrite);
  writes.push({
    kind: "increment",
    path: `tipTotals/${monthKey(paymentDate)}`,
    increments: { amountPence: payment.amountPence, count: 1 },
  });

  const result = await client.commit(writes, transaction);
  return { status, duplicate: result === "duplicate" };
};

export const createReceiver = (deps: ReceiverDeps) => {
  let cache: { secret: string; client: FirestoreClient } | null = null;

  const clientFor = (secret: string): FirestoreClient => {
    if (cache && cache.secret === secret) return cache.client;
    const serviceAccount = parseServiceAccount(secret);
    const client = createFirestoreClient({
      projectId: serviceAccount.projectId,
      getToken: createTokenProvider({
        serviceAccount,
        fetch: deps.fetch,
        now: () => deps.now().getTime(),
      }),
      fetch: deps.fetch,
    });
    cache = { secret, client };
    return client;
  };

  return async (request: Request, env: Env): Promise<Response> => {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/kofi") return reply(404, "Not found");

    const payment = parseKofiPayload(await request.text());
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
    } catch {
      console.error(`kofi payment ${payment.id} failed`);
      return reply(500, "Upstream failure");
    }
  };
};
