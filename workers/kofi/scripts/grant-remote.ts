import { ManualGrantRefusal, type ManualGrantOutcome } from "../src/manual-grant";

export class RemoteGrantError extends Error {}

export interface RemoteGrantInput {
  url: string;
  token: string;
  paymentId: string;
  uid?: string;
  email?: string;
  months?: number;
  dryRun: boolean;
  fetch: typeof fetch;
}

const parseJson = async (response: Response): Promise<Record<string, unknown> | null> => {
  try {
    const value: unknown = await response.json();
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

const toDate = (value: unknown): Date | null => {
  if (value === null) return null;
  if (typeof value !== "string") throw new RemoteGrantError("The Worker sent an unreadable reply");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new RemoteGrantError("The Worker sent an unreadable reply");
  }
  return date;
};

const toOutcome = (body: Record<string, unknown> | null): ManualGrantOutcome => {
  if (
    !body ||
    typeof body.payment !== "string" ||
    typeof body.uid !== "string" ||
    typeof body.months !== "number" ||
    (body.status !== "granted" && body.status !== "already-lifetime") ||
    typeof body.dryRun !== "boolean"
  ) {
    throw new RemoteGrantError("The Worker sent an unreadable reply");
  }
  return {
    paymentId: body.payment,
    uid: body.uid,
    months: body.months,
    status: body.status,
    previousExpiry: toDate(body.previousExpiry),
    newExpiry: toDate(body.newExpiry),
    dryRun: body.dryRun,
  };
};

export const runRemoteGrant = async (input: RemoteGrantInput): Promise<ManualGrantOutcome> => {
  const payload: Record<string, unknown> = { payment: input.paymentId };
  if (input.uid !== undefined) payload.uid = input.uid;
  if (input.email !== undefined) payload.email = input.email;
  if (input.months !== undefined) payload.months = input.months;
  payload.dryRun = input.dryRun;

  let response: Response;
  try {
    response = await input.fetch(`${input.url}/admin/grant`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new RemoteGrantError("The Worker could not be reached");
  }

  if (response.status === 200) return toOutcome(await parseJson(response));

  const body = await parseJson(response);
  const message = typeof body?.error === "string" ? body.error : null;

  if (response.status === 401) {
    throw new RemoteGrantError(
      "The Worker rejected the token (401). Check that the token file matches the KOFI_ADMIN_TOKEN secret",
    );
  }
  if ((response.status === 409 || response.status === 404) && message) {
    throw new ManualGrantRefusal(message);
  }
  if (response.status === 404) {
    throw new RemoteGrantError(
      "The Worker has no admin endpoint (404). Check --url and that the KOFI_ADMIN_TOKEN secret is set",
    );
  }
  throw new RemoteGrantError(
    `The Worker answered ${response.status}${message ? `: ${message}` : ""}`,
  );
};
