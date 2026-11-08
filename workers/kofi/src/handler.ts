import { extractCode } from "./codes";
import { decideGrant, type ExistingEntitlement, type PaymentStatus } from "./decision";
import { UpstreamError } from "./errors";
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
const MAX_BODY_BYTES = 16384;
const MAX_TIMESTAMP_SKEW_MS = 2 * 24 * 60 * 60 * 1000;
const SAFE_UID = /^[A-Za-z0-9]{1,128}$/;

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

const truncate = (value: string, limit: number): string => {
  const wellFormed = value.replace(LONE_SURROGATE, "\uFFFD");
  const characters = Array.from(wellFormed);
  return characters.length > limit ? characters.slice(0, limit).join("") : wellFormed;
};

const readBody = async (request: Request): Promise<string | null> => {
  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) > MAX_BODY_BYTES) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
};

const reply = (status: number, body: string): Response =>
  new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

const EXPIRED_MS = 0;

const expiryOf = (value: unknown): number | null => {
  if (value === undefined || value === null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getTime();
  return EXPIRED_MS;
};

const toEntitlement = (document: Record<string, unknown> | null): ExistingEntitlement | null => {
  if (!document) return null;
  return { premium: document.premium === true, expiresAtMs: expiryOf(document.expiresAt) };
};

const findMatch = async (client: FirestoreClient, payment: KofiPayment): Promise<Match | null> => {
  const code = extractCode(payment.message);
  if (code) {
    const document = await client.getDocument(`premiumCodes/${code}`);
    if (document && typeof document.uid === "string" && SAFE_UID.test(document.uid)) {
      if (await client.hasActiveAccount(document.uid)) {
        return { uid: document.uid, matchedBy: "code" };
      }
    }
  }
  const email = payment.email.trim().toLowerCase();
  if (email) {
    const uid = await client.lookupUidByEmail(email);
    if (uid && uid.length <= 128 && !uid.includes("/")) return { uid, matchedBy: "email" };
  }
  return null;
};

const paymentDateFor = (timestamp: string, now: Date): Date => {
  const reported = new Date(timestamp);
  const skew = Math.abs(reported.getTime() - now.getTime());
  return Number.isNaN(skew) || skew > MAX_TIMESTAMP_SKEW_MS ? now : reported;
};

const processPayment = async (
  client: FirestoreClient,
  payment: KofiPayment,
  now: Date,
): Promise<{ status: PaymentStatus; duplicate: boolean }> => {
  const countsAsTip =
    PREMIUM_TYPES.has(payment.type) && payment.currency.toUpperCase() === "GBP";
  const months = countsAsTip ? monthsForPayment(payment.amountPence, payment.currency) : 0;
  const paymentDate = paymentDateFor(payment.timestamp, now);

  let status: PaymentStatus = "needs-review";
  let match: Match | null = null;
  let transaction: string | undefined;
  let entitlementWrite: DocumentWrite | null = null;

  try {
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
    if (entitlementWrite) writes.push(entitlementWrite);
    if (countsAsTip) {
      writes.push({
        kind: "increment",
        path: `tipTotals/${monthKey(paymentDate)}`,
        increments: { amountPence: payment.amountPence, count: 1 },
      });
    }

    const result = await client.commit(writes, transaction);
    if (result === "duplicate" && transaction !== undefined) {
      await client.rollback(transaction).catch(() => undefined);
    }
    return { status, duplicate: result === "duplicate" };
  } catch (error) {
    if (transaction !== undefined) {
      await client.rollback(transaction).catch(() => undefined);
    }
    throw error;
  }
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
      const cause =
        error instanceof UpstreamError ? error.message : error instanceof Error ? error.name : "unknown";
      console.error(`kofi payment ${payment.id} failed: ${cause}`);
      return reply(500, "Upstream failure");
    }
  };
};
