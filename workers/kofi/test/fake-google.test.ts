import { beforeAll, describe, expect, it } from "vitest";
import { parseServiceAccount, signJwt } from "../src/google-auth";
import { createFakeGoogle } from "./fake-google";
import { generateTestKeys, serviceAccountJson, type TestKeys } from "./keys";

const NOW_MS = 1_800_000_000_000;
const TOKEN_URI = "https://oauth2.googleapis.com/token";
const SCOPES = [
  "https://www.googleapis.com/auth/datastore",
  "https://www.googleapis.com/auth/identitytoolkit",
].join(" ");

let keys: TestKeys;

beforeAll(async () => {
  keys = await generateTestKeys();
});

const base64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const encodeJson = (value: unknown): string =>
  base64Url(new TextEncoder().encode(JSON.stringify(value)));

const signClaims = async (claims: Record<string, unknown>): Promise<string> => {
  const der = Uint8Array.from(
    atob(keys.privateKeyPem.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "")),
    (char) => char.charCodeAt(0),
  );
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const input = `${encodeJson({ alg: "RS256", typ: "JWT" })}.${encodeJson(claims)}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(input),
  );
  return `${input}.${base64Url(new Uint8Array(signature))}`;
};

const exchange = (google: ReturnType<typeof createFakeGoogle>, assertion: string) =>
  google.fetch(TOKEN_URI, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString(),
  });

const claimsAt = (iat: number, lifetime: number) => ({
  iss: "kofi-receiver@demo-project.iam.gserviceaccount.com",
  scope: SCOPES,
  aud: TOKEN_URI,
  iat,
  exp: iat + lifetime,
});

describe("fake token endpoint", () => {
  const setup = () => createFakeGoogle({ publicKey: keys.publicKey, now: () => NOW_MS });

  it("accepts an assertion issued now for one hour", async () => {
    const account = parseServiceAccount(serviceAccountJson(keys.privateKeyPem));
    const response = await exchange(setup(), await signJwt(account, NOW_MS / 1000));
    expect(response.status).toBe(200);
  });

  it("rejects an assertion whose iat is in milliseconds", async () => {
    const account = parseServiceAccount(serviceAccountJson(keys.privateKeyPem));
    const response = await exchange(setup(), await signJwt(account, NOW_MS));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_grant" });
  });

  it("accepts an iat five minutes from the clock and rejects one beyond it", async () => {
    const google = setup();
    const edge = await exchange(google, await signClaims(claimsAt(NOW_MS / 1000 - 300, 3600)));
    expect(edge.status).toBe(200);
    const past = await exchange(google, await signClaims(claimsAt(NOW_MS / 1000 - 301, 3600)));
    expect(past.status).toBe(400);
    const future = await exchange(google, await signClaims(claimsAt(NOW_MS / 1000 + 301, 3600)));
    expect(future.status).toBe(400);
  });

  it("rejects an assertion that lives beyond one hour", async () => {
    const google = setup();
    const response = await exchange(google, await signClaims(claimsAt(NOW_MS / 1000, 3601)));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_grant" });
  });
});

describe("fake access tokens", () => {
  it("answers 401 UNAUTHENTICATED once a token has expired", async () => {
    let clock = NOW_MS;
    const google = createFakeGoogle({
      publicKey: keys.publicKey,
      now: () => clock,
      tokenLifetimeSeconds: 600,
    });
    const account = parseServiceAccount(serviceAccountJson(keys.privateKeyPem));
    const granted = (await (await exchange(google, await signJwt(account, clock / 1000))).json()) as {
      access_token: string;
    };
    const call = () =>
      google.fetch(
        "https://firestore.googleapis.com/v1/projects/demo-project/databases/(default)/documents/a/b",
        { headers: { authorization: `Bearer ${granted.access_token}` } },
      );
    expect((await call()).status).toBe(404);
    clock += 600_000;
    const expired = await call();
    expect(expired.status).toBe(401);
    expect(await expired.json()).toMatchObject({ error: { status: "UNAUTHENTICATED" } });
  });
});
