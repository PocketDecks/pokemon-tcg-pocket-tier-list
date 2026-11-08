import { beforeAll, describe, expect, it, vi } from "vitest";
import { createTokenProvider, parseServiceAccount, signJwt } from "../src/google-auth";
import { generateTestKeys, serviceAccountJson, type TestKeys } from "./keys";

let keys: TestKeys;

beforeAll(async () => {
  keys = await generateTestKeys();
});

const toBytes = (segment: string) => {
  const binary = atob(segment.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

const decodeSegment = (segment: string) =>
  JSON.parse(new TextDecoder().decode(toBytes(segment)));

describe("parseServiceAccount", () => {
  it("reads the fields the Worker needs", () => {
    const account = parseServiceAccount(serviceAccountJson(keys.privateKeyPem));
    expect(account.projectId).toBe("demo-project");
    expect(account.clientEmail).toBe("kofi-receiver@demo-project.iam.gserviceaccount.com");
  });

  it("throws on invalid JSON or missing fields", () => {
    expect(() => parseServiceAccount("nope")).toThrow();
    expect(() => parseServiceAccount(JSON.stringify({ project_id: "x" }))).toThrow();
  });
});

describe("signJwt", () => {
  it("produces the right claims and a verifiable RS256 signature", async () => {
    const account = parseServiceAccount(serviceAccountJson(keys.privateKeyPem));
    const jwt = await signJwt(account, 1_800_000_000);
    const [header, claims, signature] = jwt.split(".");
    expect(decodeSegment(header)).toMatchObject({ alg: "RS256", typ: "JWT" });
    const payload = decodeSegment(claims);
    expect(payload.iss).toBe(account.clientEmail);
    expect(payload.aud).toBe("https://oauth2.googleapis.com/token");
    expect(payload.iat).toBe(1_800_000_000);
    expect(payload.exp).toBe(1_800_003_600);
    expect(payload.scope.split(" ").sort()).toEqual([
      "https://www.googleapis.com/auth/datastore",
      "https://www.googleapis.com/auth/identitytoolkit",
    ]);
    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      keys.publicKey,
      toBytes(signature),
      new TextEncoder().encode(`${header}.${claims}`),
    );
    expect(valid).toBe(true);
  });
});

describe("createTokenProvider", () => {
  const setup = () => {
    let clock = 1_800_000_000_000;
    let counter = 0;
    const fetchMock = vi.fn<typeof fetch>(async () => {
      counter += 1;
      return new Response(
        JSON.stringify({
          access_token: `token-${counter}`,
          expires_in: 3600,
          token_type: "Bearer",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const provider = createTokenProvider({
      serviceAccount: parseServiceAccount(serviceAccountJson(keys.privateKeyPem)),
      fetch: fetchMock,
      now: () => clock,
    });
    return {
      provider,
      fetchMock,
      advance: (ms: number) => {
        clock += ms;
      },
    };
  };

  it("posts the assertion to the token endpoint", async () => {
    const { provider, fetchMock } = setup();
    await provider();
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://oauth2.googleapis.com/token");
    const body = new URLSearchParams(String(init?.body));
    expect(body.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    expect(body.get("assertion")?.split(".")).toHaveLength(3);
  });

  it("reuses a cached token", async () => {
    const { provider, fetchMock, advance } = setup();
    expect(await provider()).toBe("token-1");
    advance(30 * 60 * 1000);
    expect(await provider()).toBe("token-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("still reuses the token 150 seconds before expiry", async () => {
    const { provider, fetchMock, advance } = setup();
    expect(await provider()).toBe("token-1");
    advance(3450 * 1000);
    expect(await provider()).toBe("token-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refreshes shortly before expiry", async () => {
    const { provider, fetchMock, advance } = setup();
    expect(await provider()).toBe("token-1");
    advance(3600 * 1000 - 30 * 1000);
    expect(await provider()).toBe("token-2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shares one request between concurrent callers", async () => {
    const { provider, fetchMock } = setup();
    const [a, b] = await Promise.all([provider(), provider()]);
    expect(a).toBe(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws when the token endpoint fails", async () => {
    const provider = createTokenProvider({
      serviceAccount: parseServiceAccount(serviceAccountJson(keys.privateKeyPem)),
      fetch: (async () => new Response("denied", { status: 401 })) as unknown as typeof fetch,
      now: () => 1_800_000_000_000,
    });
    await expect(provider()).rejects.toThrow();
  });
});
