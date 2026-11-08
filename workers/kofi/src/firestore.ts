export class UpstreamError extends Error {}

export type FieldValue = string | number | boolean | Date | null;

export type DocumentWrite =
  | { kind: "create"; path: string; fields: Record<string, FieldValue> }
  | { kind: "merge"; path: string; fields: Record<string, FieldValue> }
  | { kind: "increment"; path: string; increments: Record<string, number> };

export type CommitResult = "committed" | "duplicate";

export interface FirestoreClient {
  beginTransaction(): Promise<string>;
  getDocument(path: string, transaction?: string): Promise<Record<string, unknown> | null>;
  commit(writes: DocumentWrite[], transaction?: string): Promise<CommitResult>;
  rollback(transaction: string): Promise<void>;
  lookupUidByEmail(email: string): Promise<string | null>;
}

const encodeValue = (value: FieldValue): Record<string, unknown> => {
  if (value === null) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  return { integerValue: String(Math.trunc(value)) };
};

const encodeFields = (fields: Record<string, FieldValue>) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, encodeValue(value)]));

const decodeValue = (value: Record<string, unknown>): unknown => {
  if (typeof value.stringValue === "string") return value.stringValue;
  if (typeof value.booleanValue === "boolean") return value.booleanValue;
  if (typeof value.integerValue === "string") return Number(value.integerValue);
  if (typeof value.timestampValue === "string") return new Date(value.timestampValue);
  return null;
};

const decodeFields = (fields: Record<string, Record<string, unknown>> | undefined) =>
  Object.fromEntries(
    Object.entries(fields ?? {}).map(([key, value]) => [key, decodeValue(value)]),
  );

const errorStatus = async (response: Response): Promise<string | null> => {
  try {
    const body = (await response.json()) as { error?: { status?: unknown } };
    return typeof body.error?.status === "string" ? body.error.status : null;
  } catch {
    return null;
  }
};

export const createFirestoreClient = (options: {
  projectId: string;
  getToken: () => Promise<string>;
  fetch: typeof fetch;
}): FirestoreClient => {
  const { projectId, getToken, fetch: fetchImpl } = options;
  const documentsRoot = `projects/${projectId}/databases/(default)/documents`;
  const base = `https://firestore.googleapis.com/v1/${documentsRoot}`;

  const send = async (url: string, init: RequestInit = {}): Promise<Response> => {
    const token = await getToken();
    const headers: Record<string, string> = { authorization: `Bearer ${token}` };
    if (init.body) headers["content-type"] = "application/json";
    return fetchImpl(url, { ...init, headers });
  };

  const toWrite = (write: DocumentWrite): Record<string, unknown> => {
    const name = `${documentsRoot}/${write.path}`;
    if (write.kind === "create") {
      return {
        update: { name, fields: encodeFields(write.fields) },
        currentDocument: { exists: false },
      };
    }
    if (write.kind === "merge") {
      return {
        update: { name, fields: encodeFields(write.fields) },
        updateMask: { fieldPaths: Object.keys(write.fields) },
      };
    }
    return {
      transform: {
        document: name,
        fieldTransforms: Object.entries(write.increments).map(([fieldPath, amount]) => ({
          fieldPath,
          increment: { integerValue: String(amount) },
        })),
      },
    };
  };

  return {
    async beginTransaction() {
      const response = await send(`${base}:beginTransaction`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (!response.ok) throw new UpstreamError(`beginTransaction failed: ${response.status}`);
      const body = (await response.json()) as { transaction?: unknown };
      if (typeof body.transaction !== "string") throw new UpstreamError("No transaction id");
      return body.transaction;
    },

    async getDocument(path, transaction) {
      const query = transaction ? `?transaction=${encodeURIComponent(transaction)}` : "";
      const response = await send(`${base}/${path}${query}`);
      if (response.status === 404 && (await errorStatus(response)) === "NOT_FOUND") return null;
      if (!response.ok) throw new UpstreamError(`getDocument failed: ${response.status}`);
      const body = (await response.json()) as {
        fields?: Record<string, Record<string, unknown>>;
      };
      return decodeFields(body.fields);
    },

    async commit(writes, transaction) {
      const payload: Record<string, unknown> = { writes: writes.map(toWrite) };
      if (transaction) payload.transaction = transaction;
      const response = await send(`${base}:commit`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (response.ok) return "committed";
      const status = await errorStatus(response);
      if (status === "ALREADY_EXISTS") return "duplicate";
      throw new UpstreamError(`commit failed: ${response.status}`);
    },

    async rollback(transaction) {
      const response = await send(`${base}:rollback`, {
        method: "POST",
        body: JSON.stringify({ transaction }),
      });
      if (!response.ok) throw new UpstreamError(`rollback failed: ${response.status}`);
    },

    async lookupUidByEmail(email) {
      const response = await send(
        `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:lookup`,
        { method: "POST", body: JSON.stringify({ email: [email] }) },
      );
      if (response.status === 400) return null;
      if (!response.ok) throw new UpstreamError(`accounts:lookup failed: ${response.status}`);
      const body = (await response.json()) as {
        users?: { localId?: unknown; emailVerified?: unknown; disabled?: unknown }[];
      };
      if (body.users?.length !== 1) return null;
      const [user] = body.users;
      if (user.emailVerified !== true || user.disabled === true) return null;
      return typeof user.localId === "string" ? user.localId : null;
    },
  };
};
