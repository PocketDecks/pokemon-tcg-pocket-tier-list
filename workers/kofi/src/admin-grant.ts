import { readBody } from "./body";
import { isSafeUid } from "./entitlement";
import { describeFailure } from "./errors";
import type { FirestoreClient } from "./firestore";
import { isValidMonths, isValidPaymentId } from "./ids";
import { grantManually, ManualGrantRefusal, resolveGrantUid } from "./manual-grant";
import { tokensMatch } from "./token";

export interface AdminGrantDeps {
  adminToken: string;
  client: () => FirestoreClient;
  now: Date;
}

interface GrantRequest {
  payment: string;
  uid?: string;
  email?: string;
  months?: number;
  dryRun: boolean;
}

const MAX_EMAIL_LENGTH = 320;
const BEARER = /^bearer +(\S+)$/i;

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

const failure = (status: number, error: string): Response => json(status, { error });

const parseRequest = (text: string): GrantRequest | null => {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;

  const { payment, uid, email, months, dryRun } = record;
  if (typeof payment !== "string" || !isValidPaymentId(payment)) return null;
  if ((uid === undefined) === (email === undefined)) return null;
  if (uid !== undefined && !isSafeUid(uid)) return null;
  if (email !== undefined) {
    if (typeof email !== "string") return null;
    if (email.trim() === "" || email.length > MAX_EMAIL_LENGTH) return null;
  }
  if (months !== undefined && !isValidMonths(months)) return null;
  if (dryRun !== undefined && typeof dryRun !== "boolean") return null;

  return {
    payment,
    uid: uid as string | undefined,
    email: email as string | undefined,
    months: months as number | undefined,
    dryRun: dryRun === true,
  };
};

export const handleAdminGrant = async (
  request: Request,
  deps: AdminGrantDeps,
): Promise<Response> => {
  const received = BEARER.exec(request.headers.get("authorization") ?? "")?.[1] ?? "";
  if (!tokensMatch(deps.adminToken, received)) return failure(401, "unauthorised");

  const text = await readBody(request);
  if (text === null) return failure(413, "payload too large");

  const parsed = parseRequest(text);
  if (!parsed) return failure(400, "malformed request");

  try {
    const client = deps.client();
    const uid = await resolveGrantUid(client, { uid: parsed.uid, email: parsed.email });
    if (uid === null) {
      console.log(`kofi admin grant ${parsed.payment} no-account`);
      return failure(404, "no single verified, enabled account for that email");
    }
    const outcome = await grantManually({
      client,
      paymentId: parsed.payment,
      uid,
      months: parsed.months,
      dryRun: parsed.dryRun,
      now: deps.now,
    });
    console.log(
      `kofi admin grant ${parsed.payment} ${outcome.status}${outcome.dryRun ? " dry-run" : ""}`,
    );
    return json(200, {
      payment: outcome.paymentId,
      uid: outcome.uid,
      months: outcome.months,
      status: outcome.status,
      previousExpiry: outcome.previousExpiry ? outcome.previousExpiry.toISOString() : null,
      newExpiry: outcome.newExpiry ? outcome.newExpiry.toISOString() : null,
      dryRun: outcome.dryRun,
    });
  } catch (error) {
    if (error instanceof ManualGrantRefusal) {
      console.log(`kofi admin grant ${parsed.payment} refused`);
      return failure(409, error.message);
    }
    console.error(`kofi admin grant ${parsed.payment} failed: ${describeFailure(error)}`);
    return failure(500, "upstream failure");
  }
};
