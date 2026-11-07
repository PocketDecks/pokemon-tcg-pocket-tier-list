import { beforeAll, describe, expect, it, vi } from "vitest";
import { createReceiver } from "../src/handler";
import { createFakeGoogle } from "./fake-google";
import { generateTestKeys, serviceAccountJson } from "./keys";

const TOKEN = "kofi-secret-token";
const NOW = new Date("2026-11-08T12:00:00.000Z");

let serviceAccount: string;

beforeAll(async () => {
  const keys = await generateTestKeys();
  serviceAccount = serviceAccountJson(keys.privateKeyPem);
});

const payment = (overrides: Record<string, unknown> = {}) => ({
  verification_token: TOKEN,
  message_id: "msg-1",
  timestamp: "2026-11-08T11:59:00Z",
  type: "Donation",
  is_public: true,
  from_name: "Ash Ketchum",
  message: "Thanks for the site",
  amount: "5.00",
  url: "https://ko-fi.com/Home/CoffeeShop?txid=abc",
  email: "ash@example.com",
  currency: "GBP",
  is_subscription_payment: false,
  is_first_subscription_payment: false,
  kofi_transaction_id: "txn-1",
  ...overrides,
});

const setup = () => {
  const google = createFakeGoogle();
  const fetchSpy = vi.fn(google.fetch);
  const receive = createReceiver({
    fetch: fetchSpy as unknown as typeof fetch,
    now: () => NOW,
  });
  const env = { KOFI_VERIFICATION_TOKEN: TOKEN, FIREBASE_SERVICE_ACCOUNT: serviceAccount };
  const post = (data: unknown, path = "/kofi") =>
    receive(
      new Request(`https://worker.example${path}`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(JSON.stringify(data))}`,
      }),
      env,
    );
  return { google, fetchSpy, receive, env, post };
};

describe("routing", () => {
  it("returns 404 for a GET on /kofi", async () => {
    const { receive, env, fetchSpy } = setup();
    const response = await receive(new Request("https://worker.example/kofi"), env);
    expect(response.status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 404 for a POST to another path", async () => {
    const { post, fetchSpy } = setup();
    expect((await post(payment(), "/other")).status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("authentication and validation", () => {
  it("returns 401 and makes no fetch when the token does not match", async () => {
    const { post, fetchSpy } = setup();
    const response = await post(payment({ verification_token: "wrong" }));
    expect(response.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 400 for a body without the data field", async () => {
    const { receive, env, fetchSpy } = setup();
    const response = await receive(
      new Request("https://worker.example/kofi", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "other=1",
      }),
      env,
    );
    expect(response.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid JSON", async () => {
    const { receive, env } = setup();
    const response = await receive(
      new Request("https://worker.example/kofi", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "data=%7Bnope",
      }),
      env,
    );
    expect(response.status).toBe(400);
  });

  it("returns 400 when required fields are missing", async () => {
    const { post } = setup();
    expect((await post(payment({ amount: undefined }))).status).toBe(400);
  });
});

describe("granting Premium", () => {
  it("grants five months from now for a new user matched by email", async () => {
    const { post, google } = setup();
    google.addUser("ash@example.com", "uid-ash");
    const response = await post(payment());
    expect(response.status).toBe(200);
    expect(google.read("entitlements/uid-ash")).toEqual({
      premium: true,
      source: "kofi",
      expiresAt: "2027-04-08T12:00:00.000Z",
      updatedAt: NOW.toISOString(),
    });
    expect(google.read("kofiPayments/txn-1")).toMatchObject({
      type: "Donation",
      amountPence: 500,
      currency: "GBP",
      months: 5,
      status: "granted",
      uid: "uid-ash",
      matchedBy: "email",
      receivedAt: NOW.toISOString(),
      kofiTimestamp: "2026-11-08T11:59:00Z",
      isSubscriptionPayment: false,
    });
    expect(google.read("tipTotals/2026-11")).toEqual({ amountPence: 500, count: 1 });
  });

  it("does not store the email or name on a granted payment", async () => {
    const { post, google } = setup();
    google.addUser("ash@example.com", "uid-ash");
    await post(payment());
    const stored = google.read("kofiPayments/txn-1");
    expect(stored).not.toHaveProperty("email");
    expect(stored).not.toHaveProperty("fromName");
  });

  it("stacks from a future expiry", async () => {
    const { post, google } = setup();
    google.addUser("ash@example.com", "uid-ash");
    google.seed("entitlements/uid-ash", {
      premium: true,
      source: "kofi",
      expiresAt: new Date("2027-01-15T00:00:00.000Z"),
      updatedAt: new Date("2026-10-01T00:00:00.000Z"),
    });
    await post(payment({ amount: "2.00" }));
    expect(google.read("entitlements/uid-ash")?.expiresAt).toBe("2027-03-15T00:00:00.000Z");
  });

  it("restarts from now when the expiry has passed", async () => {
    const { post, google } = setup();
    google.addUser("ash@example.com", "uid-ash");
    google.seed("entitlements/uid-ash", {
      premium: true,
      source: "kofi",
      expiresAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    await post(payment({ amount: "1.00" }));
    expect(google.read("entitlements/uid-ash")?.expiresAt).toBe("2026-12-08T12:00:00.000Z");
  });

  it("leaves a lifetime grant alone and records already-lifetime", async () => {
    const { post, google } = setup();
    google.addUser("ash@example.com", "uid-ash");
    google.seed("entitlements/uid-ash", {
      premium: true,
      source: "manual",
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const response = await post(payment());
    expect(response.status).toBe(200);
    expect(google.read("entitlements/uid-ash")).toEqual({
      premium: true,
      source: "manual",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(google.read("kofiPayments/txn-1")).toMatchObject({
      status: "already-lifetime",
      uid: "uid-ash",
    });
    expect(google.read("tipTotals/2026-11")).toEqual({ amountPence: 500, count: 1 });
  });

  it("clamps a month-end expiry when stacking", async () => {
    const { post, google } = setup();
    google.addUser("ash@example.com", "uid-ash");
    google.seed("entitlements/uid-ash", {
      premium: true,
      source: "kofi",
      expiresAt: new Date("2027-01-31T10:00:00.000Z"),
      updatedAt: new Date("2026-10-01T00:00:00.000Z"),
    });
    await post(payment({ amount: "1.00" }));
    expect(google.read("entitlements/uid-ash")?.expiresAt).toBe("2027-02-28T10:00:00.000Z");
  });
});

describe("review and matching", () => {
  it("records 0.99 as needs-review with no entitlement write", async () => {
    const { post, google } = setup();
    google.addUser("ash@example.com", "uid-ash");
    const response = await post(payment({ amount: "0.99" }));
    expect(response.status).toBe(200);
    expect(google.read("entitlements/uid-ash")).toBeUndefined();
    expect(google.read("kofiPayments/txn-1")).toMatchObject({
      status: "needs-review",
      months: 0,
      amountPence: 99,
      email: "ash@example.com",
      fromName: "Ash Ketchum",
    });
    expect(google.read("tipTotals/2026-11")).toEqual({ amountPence: 99, count: 1 });
  });

  it("records a non-GBP payment as needs-review with no entitlement write", async () => {
    const { post, google } = setup();
    google.addUser("ash@example.com", "uid-ash");
    await post(payment({ currency: "USD", amount: "10.00" }));
    expect(google.read("entitlements/uid-ash")).toBeUndefined();
    expect(google.read("kofiPayments/txn-1")).toMatchObject({
      status: "needs-review",
      currency: "USD",
      months: 0,
    });
  });

  it("prefers a code in the message over the email", async () => {
    const { post, google } = setup();
    google.addUser("ash@example.com", "uid-email");
    google.seed("premiumCodes/PD-ABC123", { uid: "uid-code" });
    await post(payment({ message: "Great work PD-ABC123" }));
    expect(google.read("entitlements/uid-code")).toMatchObject({ premium: true });
    expect(google.read("entitlements/uid-email")).toBeUndefined();
    expect(google.read("kofiPayments/txn-1")).toMatchObject({
      uid: "uid-code",
      matchedBy: "code",
    });
  });

  it("falls back to the email when the code is unknown", async () => {
    const { post, google } = setup();
    google.addUser("ash@example.com", "uid-email");
    await post(payment({ message: "PD-ZZZZZZ" }));
    expect(google.read("kofiPayments/txn-1")).toMatchObject({
      uid: "uid-email",
      matchedBy: "email",
    });
  });

  it("uses the email lookup when the message has no code", async () => {
    const { post, google } = setup();
    google.addUser("ash@example.com", "uid-email");
    await post(payment());
    const lookups = google.calls.filter((call) => call.url.includes("accounts:lookup"));
    expect(lookups).toHaveLength(1);
    expect(google.read("entitlements/uid-email")).toMatchObject({ premium: true });
  });

  it("records unmatched payments with the email kept and no entitlement", async () => {
    const { post, google } = setup();
    const response = await post(payment());
    expect(response.status).toBe(200);
    expect(google.read("kofiPayments/txn-1")).toMatchObject({
      status: "unmatched",
      email: "ash@example.com",
      fromName: "Ash Ketchum",
      months: 5,
    });
    expect(google.read("kofiPayments/txn-1")).not.toHaveProperty("uid");
    expect(google.docPaths().some((path) => path.startsWith("entitlements/"))).toBe(false);
    expect(google.read("tipTotals/2026-11")).toEqual({ amountPence: 500, count: 1 });
  });

  it("accumulates monthly totals across payments", async () => {
    const { post, google } = setup();
    await post(payment());
    await post(payment({ kofi_transaction_id: "txn-2", amount: "3.00" }));
    expect(google.read("tipTotals/2026-11")).toEqual({ amountPence: 800, count: 2 });
  });
});

describe("idempotency and failures", () => {
  it("returns 200 and changes nothing for a duplicate delivery", async () => {
    const { post, google } = setup();
    google.addUser("ash@example.com", "uid-ash");
    expect((await post(payment())).status).toBe(200);
    const before = JSON.stringify([
      google.read("entitlements/uid-ash"),
      google.read("tipTotals/2026-11"),
      google.read("kofiPayments/txn-1"),
    ]);
    const second = await post(payment());
    expect(second.status).toBe(200);
    const after = JSON.stringify([
      google.read("entitlements/uid-ash"),
      google.read("tipTotals/2026-11"),
      google.read("kofiPayments/txn-1"),
    ]);
    expect(after).toBe(before);
  });

  it("treats a FAILED_PRECONDITION commit as a duplicate", async () => {
    const { post, google } = setup();
    google.failCommits(400, { error: { code: 400, status: "FAILED_PRECONDITION" } });
    expect((await post(payment())).status).toBe(200);
  });

  it("returns 500 when Firestore fails so Ko-fi retries", async () => {
    const { post, google } = setup();
    google.addUser("ash@example.com", "uid-ash");
    google.failCommits(500);
    const response = await post(payment());
    expect(response.status).toBe(500);
    expect(google.docPaths()).toEqual([]);
  });

  it("returns 500 for an aborted transaction so Ko-fi retries", async () => {
    const { post, google } = setup();
    google.failCommits(409, { error: { code: 409, status: "ABORTED" } });
    expect((await post(payment())).status).toBe(500);
  });

  it("returns 500 when the service account secret is invalid", async () => {
    const { receive } = setup();
    const response = await receive(
      new Request("https://worker.example/kofi", {
        method: "POST",
        body: `data=${encodeURIComponent(JSON.stringify(payment()))}`,
        headers: { "content-type": "application/x-www-form-urlencoded" },
      }),
      { KOFI_VERIFICATION_TOKEN: TOKEN, FIREBASE_SERVICE_ACCOUNT: "not json" },
    );
    expect(response.status).toBe(500);
  });

  it("never echoes the token, email or service account", async () => {
    const { post, google, env } = setup();
    google.addUser("ash@example.com", "uid-ash");
    const responses = [
      await post(payment()),
      await post(payment()),
      await post(payment({ verification_token: "wrong" })),
    ];
    google.failCommits(500);
    responses.push(await post(payment({ kofi_transaction_id: "txn-9" })));
    for (const response of responses) {
      const text = await response.text();
      expect(text).not.toContain(TOKEN);
      expect(text).not.toContain("ash@example.com");
      expect(text).not.toContain(env.FIREBASE_SERVICE_ACCOUNT.slice(20, 60));
    }
  });

  it("reuses one Google access token across requests", async () => {
    const { post, google } = setup();
    await post(payment());
    await post(payment({ kofi_transaction_id: "txn-2" }));
    const tokenCalls = google.calls.filter((call) => call.url === "https://oauth2.googleapis.com/token");
    expect(tokenCalls).toHaveLength(1);
  });
});
