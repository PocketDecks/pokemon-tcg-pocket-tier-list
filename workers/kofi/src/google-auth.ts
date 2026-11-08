import { UpstreamError } from "./errors";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/datastore",
  "https://www.googleapis.com/auth/identitytoolkit",
];

const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";
const JWT_LIFETIME_SECONDS = 3600;
const REFRESH_MARGIN_MS = 60_000;

export interface ServiceAccount {
  projectId: string;
  clientEmail: string;
  privateKey: string;
  privateKeyId?: string;
  tokenUri: string;
}

export const parseServiceAccount = (json: string): ServiceAccount => {
  const parsed: unknown = JSON.parse(json);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Service account is not an object");
  }
  const record = parsed as Record<string, unknown>;
  const { project_id, client_email, private_key, private_key_id, token_uri } = record;
  if (
    typeof project_id !== "string" ||
    typeof client_email !== "string" ||
    typeof private_key !== "string"
  ) {
    throw new Error("Service account is missing required fields");
  }
  return {
    projectId: project_id,
    clientEmail: client_email,
    privateKey: private_key,
    privateKeyId: typeof private_key_id === "string" ? private_key_id : undefined,
    tokenUri: typeof token_uri === "string" ? token_uri : DEFAULT_TOKEN_URI,
  };
};

const base64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const encodeJson = (value: unknown): string =>
  base64Url(new TextEncoder().encode(JSON.stringify(value)));

const pemToDer = (pem: string): Uint8Array => {
  const body = pem
    .replace(/-----BEGIN [A-Z ]+-----/, "")
    .replace(/-----END [A-Z ]+-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(body);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

export const signJwt = async (
  account: ServiceAccount,
  nowSeconds: number,
): Promise<string> => {
  const header: Record<string, string> = { alg: "RS256", typ: "JWT" };
  if (account.privateKeyId) header.kid = account.privateKeyId;
  const claims = {
    iss: account.clientEmail,
    scope: GOOGLE_SCOPES.join(" "),
    aud: account.tokenUri,
    iat: nowSeconds,
    exp: nowSeconds + JWT_LIFETIME_SECONDS,
  };
  const signingInput = `${encodeJson(header)}.${encodeJson(claims)}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(account.privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64Url(new Uint8Array(signature))}`;
};

export type TokenProvider = (() => Promise<string>) & { invalidate: () => void };

export const createTokenProvider = (options: {
  serviceAccount: ServiceAccount;
  fetch: typeof fetch;
  now?: () => number;
}): TokenProvider => {
  const { serviceAccount, fetch: fetchImpl } = options;
  const now = options.now ?? Date.now;
  let cached: { token: string; expiresAtMs: number } | null = null;

  const refresh = async (): Promise<string> => {
    const issuedAt = now();
    const assertion = await signJwt(serviceAccount, Math.floor(issuedAt / 1000));
    const response = await fetchImpl(serviceAccount.tokenUri, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }).toString(),
    });
    if (!response.ok) throw new UpstreamError(`token exchange failed: ${response.status}`);
    const body = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
    if (typeof body.access_token !== "string") {
      throw new UpstreamError("token exchange returned no token");
    }
    const lifetimeSeconds = typeof body.expires_in === "number" ? body.expires_in : 3600;
    cached = { token: body.access_token, expiresAtMs: issuedAt + lifetimeSeconds * 1000 };
    return body.access_token;
  };

  const getToken = async () => {
    if (cached && now() < cached.expiresAtMs - REFRESH_MARGIN_MS) return cached.token;
    return refresh();
  };
  return Object.assign(getToken, {
    invalidate: () => {
      cached = null;
    },
  });
};
