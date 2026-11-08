type Fields = Record<string, Record<string, unknown>>;

export interface RecordedCall {
  method: string;
  url: string;
  body: unknown;
  authorization: string | null;
}

interface StoredDocument {
  fields: Fields;
  version: number;
}

interface TestUser {
  uid: string;
  emailVerified: boolean;
  disabled: boolean;
}

interface Failure {
  status: number;
  body: unknown;
}

const TOKEN_URI = "https://oauth2.googleapis.com/token";
const REQUIRED_SCOPES = [
  "https://www.googleapis.com/auth/datastore",
  "https://www.googleapis.com/auth/identitytoolkit",
];

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const failure = (status: number, code: string) =>
  json(status, { error: { code: status, status: code } });

const decodeValue = (value: Record<string, unknown>): unknown => {
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("booleanValue" in value) return value.booleanValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  return undefined;
};

const fromBase64Url = (segment: string): Uint8Array => {
  const binary = atob(segment.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

const decodeJson = (segment: string): Record<string, unknown> =>
  JSON.parse(new TextDecoder().decode(fromBase64Url(segment)));

interface TransformWrite {
  document: string;
  fieldTransforms: { fieldPath: string; increment: { integerValue: string } }[];
}

export interface FakeGoogleOptions {
  publicKey: CryptoKey;
  projectId?: string;
  tokenUri?: string;
  now?: () => number;
  tokenLifetimeSeconds?: number;
}

const MAX_CLOCK_SKEW_SECONDS = 300;
const MAX_ASSERTION_LIFETIME_SECONDS = 3600;

export const createFakeGoogle = (options: FakeGoogleOptions) => {
  const {
    publicKey,
    projectId = "demo-project",
    tokenUri = TOKEN_URI,
    now = Date.now,
    tokenLifetimeSeconds = 3600,
  } = options;
  const docs = new Map<string, StoredDocument>();
  const users = new Map<string, TestUser[]>();
  const issuedTokens = new Map<string, number>();
  const transactions = new Map<string, Map<string, number>>();
  const calls: RecordedCall[] = [];
  const commitWrites: Record<string, unknown>[][] = [];
  const rollbacks: string[] = [];
  const state: {
    commit?: Failure;
    read?: Failure & { transactionalOnly: boolean };
    rollback?: Failure;
    lookupMissAs400: boolean;
  } = { lookupMissAs400: false };
  let tokenCounter = 0;
  let transactionCounter = 0;

  const docRoot = `projects/${projectId}/databases/(default)/documents`;
  const fsBase = `https://firestore.googleapis.com/v1/${docRoot}`;
  const lookupUrl = `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:lookup`;
  const relative = (name: string) => name.slice(docRoot.length + 1);
  const versionOf = (path: string) => docs.get(path)?.version ?? 0;

  const store = (path: string, fields: Fields) => {
    docs.set(path, { fields, version: versionOf(path) + 1 });
  };

  const exchangeToken = async (raw: unknown, headers: Headers): Promise<Response> => {
    const invalid = () => json(400, { error: "invalid_grant" });
    if (typeof raw !== "string") return invalid();
    if (!(headers.get("content-type") ?? "").startsWith("application/x-www-form-urlencoded")) {
      return invalid();
    }
    const form = new URLSearchParams(raw);
    if (form.get("grant_type") !== "urn:ietf:params:oauth:grant-type:jwt-bearer") return invalid();
    const parts = (form.get("assertion") ?? "").split(".");
    if (parts.length !== 3) return invalid();
    try {
      const header = decodeJson(parts[0]);
      const claims = decodeJson(parts[1]);
      if (header.alg !== "RS256") return invalid();
      const verified = await crypto.subtle.verify(
        "RSASSA-PKCS1-v1_5",
        publicKey,
        fromBase64Url(parts[2]),
        new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
      );
      if (!verified) return invalid();
      if (claims.aud !== tokenUri) return invalid();
      const { iat, exp } = claims;
      if (typeof iat !== "number" || typeof exp !== "number") return invalid();
      if (Math.abs(iat - now() / 1000) > MAX_CLOCK_SKEW_SECONDS) return invalid();
      if (exp - iat > MAX_ASSERTION_LIFETIME_SECONDS || exp <= iat) return invalid();
      const scopes = String(claims.scope ?? "").split(" ");
      if (!REQUIRED_SCOPES.every((scope) => scopes.includes(scope))) return invalid();
    } catch {
      return invalid();
    }
    tokenCounter += 1;
    const token = `access-${tokenCounter}`;
    issuedTokens.set(token, now() + tokenLifetimeSeconds * 1000);
    return json(200, {
      access_token: token,
      expires_in: tokenLifetimeSeconds,
      token_type: "Bearer",
    });
  };

  const commit = (body: { writes: Record<string, unknown>[]; transaction?: string }): Response => {
    if (state.commit) return json(state.commit.status, state.commit.body);
    const { writes, transaction } = body;
    if (transaction !== undefined) {
      const reads = transactions.get(transaction);
      if (!reads) return failure(400, "INVALID_ARGUMENT");
      transactions.delete(transaction);
      for (const [path, version] of reads) {
        if (versionOf(path) !== version) return failure(409, "ABORTED");
      }
    }
    for (const write of writes) {
      const update = write.update as { name: string } | undefined;
      const precondition = write.currentDocument as { exists?: boolean } | undefined;
      if (update && precondition?.exists === false && docs.has(relative(update.name))) {
        return failure(409, "ALREADY_EXISTS");
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
          const next = { ...(docs.get(path)?.fields ?? {}) };
          for (const key of mask) next[key] = update.fields[key];
          store(path, next);
        } else {
          store(path, update.fields);
        }
      }
      if (transform) {
        const path = relative(transform.document);
        const next = { ...(docs.get(path)?.fields ?? {}) };
        for (const item of transform.fieldTransforms) {
          const current = Number(
            (next[item.fieldPath] as { integerValue?: string } | undefined)?.integerValue ?? 0,
          );
          next[item.fieldPath] = {
            integerValue: String(current + Number(item.increment.integerValue)),
          };
        }
        store(path, next);
      }
    }
    return json(200, { writeResults: writes.map(() => ({})), commitTime: "2026-11-08T12:00:00Z" });
  };

  const readDocument = (url: string): Response => {
    const parsed = new URL(url);
    const path = decodeURIComponent(parsed.pathname.slice(`/v1/${docRoot}/`.length));
    const transaction = parsed.searchParams.get("transaction");
    if (state.read && (!state.read.transactionalOnly || transaction !== null)) {
      return json(state.read.status, state.read.body);
    }
    if (transaction !== null) {
      const reads = transactions.get(transaction);
      if (!reads) return failure(400, "INVALID_ARGUMENT");
      if (!reads.has(path)) reads.set(path, versionOf(path));
    }
    const stored = docs.get(path);
    if (!stored) return failure(404, "NOT_FOUND");
    return json(200, { name: `${docRoot}/${path}`, fields: stored.fields });
  };

  const lookup = (body: { email?: string[]; localId?: string[] }): Response => {
    const matches =
      body.localId !== undefined
        ? [...users.values()].flat().filter((user) => user.uid === String(body.localId?.[0] ?? ""))
        : (users.get(String(body.email?.[0] ?? "")) ?? []);
    if (matches.length === 0) {
      return state.lookupMissAs400 ? failure(400, "USER_NOT_FOUND") : json(200, {});
    }
    return json(200, {
      users: matches.map((user) => ({
        localId: user.uid,
        emailVerified: user.emailVerified,
        disabled: user.disabled,
      })),
    });
  };

  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    const raw = init?.body;
    const body = typeof raw === "string" && raw.startsWith("{") ? JSON.parse(raw) : raw;
    calls.push({ method, url, body, authorization: headers.get("authorization") });

    if (url === tokenUri && method === "POST") return exchangeToken(raw, headers);

    const authorization = headers.get("authorization") ?? "";
    const bearer = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
    const tokenExpiry = issuedTokens.get(bearer);
    if (tokenExpiry === undefined || now() >= tokenExpiry) {
      return failure(401, "UNAUTHENTICATED");
    }

    if (url === lookupUrl && method === "POST") {
      return lookup(body as { email?: string[]; localId?: string[] });
    }

    if (url === `${fsBase}:beginTransaction` && method === "POST") {
      transactionCounter += 1;
      const id = btoa(`txn-${transactionCounter}`);
      transactions.set(id, new Map());
      return json(200, { transaction: id });
    }

    if (url === `${fsBase}:rollback` && method === "POST") {
      const id = (body as { transaction?: string }).transaction ?? "";
      rollbacks.push(id);
      if (state.rollback) return json(state.rollback.status, state.rollback.body);
      if (!transactions.has(id)) return failure(400, "INVALID_ARGUMENT");
      transactions.delete(id);
      return json(200, {});
    }

    if (url.startsWith(`${fsBase}/`) && method === "GET") return readDocument(url);

    if (url === `${fsBase}:commit` && method === "POST") {
      return commit(body as { writes: Record<string, unknown>[]; transaction?: string });
    }

    return failure(400, "INVALID_ARGUMENT");
  };

  const seed = (path: string, values: Record<string, unknown>) => {
    const fields: Fields = {};
    for (const [key, value] of Object.entries(values)) {
      if (typeof value === "string") fields[key] = { stringValue: value };
      else if (typeof value === "boolean") fields[key] = { booleanValue: value };
      else if (typeof value === "number") fields[key] = { integerValue: String(value) };
      else if (value instanceof Date) fields[key] = { timestampValue: value.toISOString() };
      else if (value === null) fields[key] = { nullValue: null };
      else if (typeof value === "object") fields[key] = value as Record<string, unknown>;
    }
    store(path, fields);
  };

  const read = (path: string): Record<string, unknown> | undefined => {
    const stored = docs.get(path);
    if (!stored) return undefined;
    return Object.fromEntries(
      Object.entries(stored.fields).map(([key, value]) => [key, decodeValue(value)]),
    );
  };

  return {
    fetch: fetchImpl as typeof fetch,
    calls,
    commitWrites,
    rollbacks,
    seed,
    read,
    addUser: (
      email: string,
      uid: string,
      flags: { emailVerified?: boolean; disabled?: boolean } = {},
    ) => {
      const key = email.toLowerCase();
      users.set(key, [
        ...(users.get(key) ?? []),
        { uid, emailVerified: flags.emailVerified ?? true, disabled: flags.disabled ?? false },
      ]);
    },
    failCommits: (status: number | undefined, body?: unknown) => {
      state.commit =
        status === undefined
          ? undefined
          : { status, body: body ?? { error: { code: status, status: "INTERNAL" } } };
    },
    failReads: (status: number, body?: unknown, transactionalOnly = false) => {
      state.read = {
        status,
        body: body ?? { error: { code: status, status: "INTERNAL" } },
        transactionalOnly,
      };
    },
    failRollbacks: (status: number) => {
      state.rollback = { status, body: { error: { code: status, status: "INTERNAL" } } };
    },
    lookupMissAs400: (enabled: boolean) => {
      state.lookupMissAs400 = enabled;
    },
    openTransactions: () => transactions.size,
    docPaths: () => [...docs.keys()],
  };
};
