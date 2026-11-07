type Fields = Record<string, Record<string, unknown>>;

export interface RecordedCall {
  method: string;
  url: string;
  body: unknown;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const decodeValue = (value: Record<string, unknown>): unknown => {
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("booleanValue" in value) return value.booleanValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  return undefined;
};

interface TransformWrite {
  document: string;
  fieldTransforms: { fieldPath: string; increment: { integerValue: string } }[];
}

export const createFakeGoogle = (projectId = "demo-project") => {
  const docs = new Map<string, Fields>();
  const users = new Map<string, string>();
  const calls: RecordedCall[] = [];
  const commitWrites: Record<string, unknown>[][] = [];
  const state: { commitStatus?: number; commitBody?: unknown } = {};
  let tokenCounter = 0;

  const docRoot = `projects/${projectId}/databases/(default)/documents`;
  const fsBase = `https://firestore.googleapis.com/v1/${docRoot}`;
  const relative = (name: string) => name.slice(docRoot.length + 1);

  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";
    const raw = init?.body;
    const body = typeof raw === "string" && raw.startsWith("{") ? JSON.parse(raw) : raw;
    calls.push({ method, url, body });

    if (url === "https://oauth2.googleapis.com/token") {
      tokenCounter += 1;
      return json(200, {
        access_token: `access-${tokenCounter}`,
        expires_in: 3600,
        token_type: "Bearer",
      });
    }

    if (url === `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:lookup`) {
      const email = String((body as { email?: string[] }).email?.[0] ?? "").toLowerCase();
      const uid = users.get(email);
      return json(200, uid ? { users: [{ localId: uid }] } : {});
    }

    if (url === `${fsBase}:beginTransaction`) {
      return json(200, { transaction: "dHhuLTE=" });
    }

    if (url.startsWith(`${fsBase}/`) && method === "GET") {
      const path = decodeURIComponent(url.slice(fsBase.length + 1).split("?")[0]);
      const fields = docs.get(path);
      if (!fields) return json(404, { error: { code: 404, status: "NOT_FOUND" } });
      return json(200, { name: `${docRoot}/${path}`, fields });
    }

    if (url === `${fsBase}:commit`) {
      if (state.commitStatus) {
        return json(
          state.commitStatus,
          state.commitBody ?? { error: { code: state.commitStatus, status: "INTERNAL" } },
        );
      }
      const writes = (body as { writes: Record<string, unknown>[] }).writes;
      for (const write of writes) {
        const update = write.update as { name: string } | undefined;
        const precondition = write.currentDocument as { exists?: boolean } | undefined;
        if (update && precondition?.exists === false && docs.has(relative(update.name))) {
          return json(409, { error: { code: 409, status: "ALREADY_EXISTS" } });
        }
      }
      commitWrites.push(writes);
      for (const write of writes) {
        const update = write.update as { name: string; fields: Fields } | undefined;
        const transform = write.transform as TransformWrite | undefined;
        if (update) {
          const path = relative(update.name);
          const mask = (write.updateMask as { fieldPaths: string[] } | undefined)?.fieldPaths;
          if (mask) {
            const next = { ...(docs.get(path) ?? {}) };
            for (const key of mask) next[key] = update.fields[key];
            docs.set(path, next);
          } else {
            docs.set(path, update.fields);
          }
        }
        if (transform) {
          const path = relative(transform.document);
          const next = { ...(docs.get(path) ?? {}) };
          for (const item of transform.fieldTransforms) {
            const current = Number(
              (next[item.fieldPath] as { integerValue?: string } | undefined)?.integerValue ?? 0,
            );
            next[item.fieldPath] = {
              integerValue: String(current + Number(item.increment.integerValue)),
            };
          }
          docs.set(path, next);
        }
      }
      return json(200, { writeResults: writes.map(() => ({})), commitTime: "2026-11-08T12:00:00Z" });
    }

    return json(404, { error: { message: "unexpected request" } });
  };

  const seed = (path: string, values: Record<string, unknown>) => {
    const fields: Fields = {};
    for (const [key, value] of Object.entries(values)) {
      if (typeof value === "string") fields[key] = { stringValue: value };
      else if (typeof value === "boolean") fields[key] = { booleanValue: value };
      else if (typeof value === "number") fields[key] = { integerValue: String(value) };
      else if (value instanceof Date) fields[key] = { timestampValue: value.toISOString() };
    }
    docs.set(path, fields);
  };

  const read = (path: string): Record<string, unknown> | undefined => {
    const fields = docs.get(path);
    if (!fields) return undefined;
    return Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]),
    );
  };

  return {
    fetch: fetchImpl as typeof fetch,
    calls,
    commitWrites,
    seed,
    read,
    addUser: (email: string, uid: string) => users.set(email.toLowerCase(), uid),
    failCommits: (status: number | undefined, body?: unknown) => {
      state.commitStatus = status;
      state.commitBody = body;
    },
    docPaths: () => [...docs.keys()],
  };
};
