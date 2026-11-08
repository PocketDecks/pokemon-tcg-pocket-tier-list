import { beforeAll, describe, expect, it, vi } from "vitest";
import { createReceiver } from "../src/handler";
import { createFakeGoogle } from "./fake-google";
import { generateTestKeys, serviceAccountJson, type TestKeys } from "./keys";

const TOKEN = "kofi-secret-token";
const NOW = new Date("2026-11-08T12:00:00.000Z");

let keys: TestKeys;
let serviceAccount: string;

beforeAll(async () => {
  keys = await generateTestKeys();
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

const setup = (now: Date = NOW) => {
  let current = now.getTime();
  const google = createFakeGoogle({ publicKey: keys.publicKey, now: () => current });
  const fetchSpy = vi.fn(google.fetch);
  const receive = createReceiver({
    fetch: fetchSpy as unknown as typeof fetch,
    now: () => new Date(current),
  });
  const advance = (milliseconds: number) => {
    current += milliseconds;
  };
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
  return { google, fetchSpy, receive, env, post, advance };
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

  it.each(["/kofi-extra", "/kofi/extra", "/kofi/"])("returns 404 for %s", async (path) => {
    const { post, fetchSpy } = setup();
    expect((await post(payment(), path)).status).toBe(404);
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

  it("returns 413 and makes no fetch when content-length is over the limit", async () => {
    const { receive, env, fetchSpy } = setup();
    const response = await receive(
      new Request("https://worker.example/kofi", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "content-length": "16385",
        },
        body: `data=${encodeURIComponent(JSON.stringify(payment()))}`,
      }),
      env,
    );
    expect(response.status).toBe(413);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("accepts a declared content-length of exactly the limit", async () => {
    const { receive, env } = setup();
    const response = await receive(
      new Request("https://worker.example/kofi", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "content-length": "16384",
        },
        body: `data=${encodeURIComponent(JSON.stringify(payment()))}`,
      }),
      env,
    );
    expect(response.status).toBe(200);
  });

  it("accepts a body at exactly the limit", async () => {
    const { receive, env } = setup();
    const filler = "x".repeat(16384 - "data=".length);
    const response = await receive(
      new Request("https://worker.example/kofi", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: `data=${filler}`,
      }),
      env,
    );
    expect(response.status).toBe(400);
  });

  it("stops reading a streamed body that passes the limit", async () => {
    const { receive, env, fetchSpy } = setup();
    const chunk = new TextEncoder().encode("x".repeat(1000));
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        if (pulled > 200) controller.close();
        else controller.enqueue(chunk);
      },
    });
    const response = await receive(
      new Request("https://worker.example/kofi", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: stream,
        duplex: "half",
      } as RequestInit),
      env,
    );
    expect(response.status).toBe(413);
    expect(pulled).toBeLessThan(50);
    expect(fetchSpy).not.toHaveBeenCalled();
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
    expect(google.read("kofiPayments/txn-1-msg-1")).toMatchObject({
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
    const stored = google.read("kofiPayments/txn-1-msg-1");
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
    expect(google.read("kofiPayments/txn-1-msg-1")).toMatchObject({
      status: "already-lifetime",
      uid: "uid-ash",
    });
    expect(google.read("tipTotals/2026-11")).toEqual({ amountPence: 500, count: 1 });
  });

  it.each([
    ["missing", undefined],
    ["an explicit null", null],
  ])("treats an expiry that is %s as a lifetime grant", async (_label, expiresAt) => {
    const { post, google } = setup();
    google.addUser("ash@example.com", "uid-ash");
    google.seed("entitlements/uid-ash", { premium: true, source: "manual", expiresAt });
    await post(payment());
    expect(google.read("kofiPayments/txn-1-msg-1")).toMatchObject({ status: "already-lifetime" });
    expect(google.read("entitlements/uid-ash")?.source).toBe("manual");
  });

  it.each([
    ["an integer", { integerValue: "4102444800000" }],
    ["a string", { stringValue: "2099-01-01T00:00:00Z" }],
    ["a double", { doubleValue: 4102444800000 }],
  ])("treats an expiry stored as %s as already expired", async (_label, expiresAt) => {
    const { post, google } = setup();
    google.addUser("ash@example.com", "uid-ash");
    google.seed("entitlements/uid-ash", { premium: true, source: "manual", expiresAt });
    await post(payment({ amount: "1.00" }));
    expect(google.read("kofiPayments/txn-1-msg-1")).toMatchObject({ status: "granted" });
    expect(google.read("entitlements/uid-ash")).toMatchObject({
      source: "kofi",
      expiresAt: "2026-12-08T12:00:00.000Z",
    });
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

  it("keeps unrelated fields on the entitlement", async () => {
    const { post, google } = setup();
    google.addUser("ash@example.com", "uid-ash");
    google.seed("entitlements/uid-ash", {
      premium: false,
      source: "kofi",
      note: "keep me",
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    await post(payment());
    expect(google.read("entitlements/uid-ash")).toMatchObject({
      premium: true,
      note: "keep me",
    });
  });

  it("sends a Google access token on every Firestore and Identity Toolkit call", async () => {
    const { post, google } = setup();
    google.addUser("ash@example.com", "uid-ash");
    await post(payment());
    const guarded = google.calls.filter((call) => call.url !== "https://oauth2.googleapis.com/token");
    expect(guarded.length).toBeGreaterThan(0);
    for (const call of guarded) expect(call.authorization).toBe("Bearer access-1");
  });

  it("keeps both payments when two deliveries race for one user", async () => {
    const { post, google } = setup();
    google.addUser("ash@example.com", "uid-ash");
    const first = post(payment({ kofi_transaction_id: "txn-a", amount: "5.00" }));
    const second = post(payment({ kofi_transaction_id: "txn-b", amount: "3.00" }));
    const responses = await Promise.all([first, second]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 500]);
    const failedId = responses[0].status === 500 ? "txn-a" : "txn-b";
    const failedAmount = failedId === "txn-a" ? "5.00" : "3.00";
    expect(google.read(`kofiPayments/${failedId}-msg-1`)).toBeUndefined();
    const retry = await post(payment({ kofi_transaction_id: failedId, amount: failedAmount }));
    expect(retry.status).toBe(200);
    expect(google.read("entitlements/uid-ash")?.expiresAt).toBe("2027-07-08T12:00:00.000Z");
    expect(google.read("tipTotals/2026-11")).toEqual({ amountPence: 800, count: 2 });
  });
});

describe("payment identity", () => {
  it("records payments that share a transaction id but carry different message ids", async () => {
    const { post, google } = setup();
    google.addUser("ash@example.com", "uid-ash");
    expect((await post(payment({ message_id: "msg-a", amount: "2.00" }))).status).toBe(200);
    const second = await post(payment({ message_id: "msg-b", amount: "3.00" }));
    expect(await second.text()).toBe("OK");
    expect(google.read("kofiPayments/txn-1-msg-a")).toMatchObject({ months: 2 });
    expect(google.read("kofiPayments/txn-1-msg-b")).toMatchObject({ months: 3 });
    expect(google.read("tipTotals/2026-11")).toEqual({ amountPence: 500, count: 2 });
  });

  it("treats the same transaction and message id as a redelivery", async () => {
    const { post, google } = setup();
    google.addUser("ash@example.com", "uid-ash");
    await post(payment());
    const again = await post(payment());
    expect(again.status).toBe(200);
    expect(await again.text()).toBe("Duplicate");
    expect(google.read("tipTotals/2026-11")).toEqual({ amountPence: 500, count: 1 });
  });
});

describe("review and matching", () => {
  it("records 0.99 as needs-review with no entitlement write", async () => {
    const { post, google } = setup();
    google.addUser("ash@example.com", "uid-ash");
    const response = await post(payment({ amount: "0.99" }));
    expect(response.status).toBe(200);
    expect(google.read("entitlements/uid-ash")).toBeUndefined();
    expect(google.read("kofiPayments/txn-1-msg-1")).toMatchObject({
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
    expect(google.read("kofiPayments/txn-1-msg-1")).toMatchObject({
      status: "needs-review",
      currency: "USD",
      months: 0,
    });
    expect(google.read("tipTotals/2026-11")).toBeUndefined();
  });

  it("counts a lower-case gbp donation in the monthly totals", async () => {
    const { post, google } = setup();
    await post(payment({ currency: "gbp", amount: "2.00" }));
    expect(google.read("tipTotals/2026-11")).toEqual({ amountPence: 200, count: 1 });
  });

  it("grants 120 months and holds 121 for review", async () => {
    const { post, google } = setup();
    google.addUser("ash@example.com", "uid-ash");
    await post(payment({ amount: "121.00" }));
    expect(google.read("entitlements/uid-ash")).toBeUndefined();
    expect(google.read("kofiPayments/txn-1-msg-1")).toMatchObject({
      status: "needs-review",
      months: 0,
      email: "ash@example.com",
    });
    expect(google.read("tipTotals/2026-11")).toEqual({ amountPence: 12100, count: 1 });
    await post(payment({ kofi_transaction_id: "txn-2", amount: "120.00" }));
    expect(google.read("kofiPayments/txn-2-msg-1")).toMatchObject({ status: "granted", months: 120 });
    expect(google.read("entitlements/uid-ash")?.expiresAt).toBe("2036-11-08T12:00:00.000Z");
  });

  it.each(["Shop Order", "Commission"])(
    "records a %s as needs-review with no entitlement write",
    async (type) => {
      const { post, google } = setup();
      google.addUser("ash@example.com", "uid-ash");
      await post(payment({ type }));
      expect(google.read("entitlements/uid-ash")).toBeUndefined();
      expect(google.read("kofiPayments/txn-1-msg-1")).toMatchObject({
        status: "needs-review",
        type,
        months: 0,
      });
      expect(google.read("tipTotals/2026-11")).toBeUndefined();
    },
  );

  it("grants months for a monthly subscription payment", async () => {
    const { post, google } = setup();
    google.addUser("ash@example.com", "uid-ash");
    await post(payment({ type: "Subscription", amount: "3.00", is_subscription_payment: true }));
    expect(google.read("kofiPayments/txn-1-msg-1")).toMatchObject({ status: "granted", months: 3 });
  });

  it("prefers a code in the message over the email", async () => {
    const { post, google } = setup();
    google.addUser("ash@example.com", "uid-email");
    google.addUser("code@example.com", "uidcode", { emailVerified: false });
    google.seed("premiumCodes/PD-ABC123", { uid: "uidcode" });
    await post(payment({ message: "Great work PD-ABC123" }));
    expect(google.read("entitlements/uidcode")).toMatchObject({ premium: true });
    expect(google.read("entitlements/uid-email")).toBeUndefined();
    expect(google.read("kofiPayments/txn-1-msg-1")).toMatchObject({
      uid: "uidcode",
      matchedBy: "code",
    });
  });

  it("looks a code's account up by its uid", async () => {
    const { post, google } = setup();
    google.addUser("code@example.com", "uidcode");
    google.seed("premiumCodes/PD-ABC123", { uid: "uidcode" });
    await post(payment({ message: "PD-ABC123" }));
    const lookups = google.calls.filter((call) => call.url.includes("accounts:lookup"));
    expect(lookups.map((call) => call.body)).toEqual([{ localId: ["uidcode"] }]);
  });

  it.each([
    ["has no account", () => undefined],
    [
      "is disabled",
      (google: ReturnType<typeof createFakeGoogle>) =>
        google.addUser("code@example.com", "uidcode", { disabled: true }),
    ],
    [
      "belongs to two accounts",
      (google: ReturnType<typeof createFakeGoogle>) => {
        google.addUser("code@example.com", "uidcode");
        google.addUser("other@example.com", "uidcode");
      },
    ],
  ])("falls back to the email when the code's uid %s", async (_label, arrange) => {
    const { post, google } = setup();
    google.addUser("ash@example.com", "uid-email");
    arrange(google);
    google.seed("premiumCodes/PD-ABC123", { uid: "uidcode" });
    await post(payment({ message: "PD-ABC123" }));
    expect(google.read("entitlements/uidcode")).toBeUndefined();
    expect(google.read("kofiPayments/txn-1-msg-1")).toMatchObject({
      uid: "uid-email",
      matchedBy: "email",
    });
  });

  it("falls back to the email when the uid lookup answers 400", async () => {
    const { post, google } = setup();
    google.addUser("ash@example.com", "uid-email");
    google.lookupMissAs400(true);
    google.seed("premiumCodes/PD-ABC123", { uid: "uidcode" });
    await post(payment({ message: "PD-ABC123" }));
    expect(google.read("kofiPayments/txn-1-msg-1")).toMatchObject({ matchedBy: "email" });
  });

  it("returns 500 when the uid lookup fails with a server error", async () => {
    const { google } = setup();
    google.addUser("code@example.com", "uidcode");
    google.seed("premiumCodes/PD-ABC123", { uid: "uidcode" });
    const original = google.fetch;
    const failing = createReceiver({
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url.includes("accounts:lookup")) return new Response("{}", { status: 503 });
        return original(input, init);
      }) as typeof fetch,
      now: () => NOW,
    });
    const response = await failing(
      new Request("https://worker.example/kofi", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(JSON.stringify(payment({ message: "PD-ABC123" })))}`,
      }),
      { KOFI_VERIFICATION_TOKEN: TOKEN, FIREBASE_SERVICE_ACCOUNT: serviceAccount },
    );
    expect(response.status).toBe(500);
  });

  it("falls back to the email when the code is unknown", async () => {
    const { post, google } = setup();
    google.addUser("ash@example.com", "uid-email");
    await post(payment({ message: "PD-ZZZZZZ" }));
    expect(google.read("kofiPayments/txn-1-msg-1")).toMatchObject({
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

  it("looks the email up trimmed and in lower case", async () => {
    const { post, google } = setup();
    google.addUser("ash@example.com", "uid-ash");
    await post(payment({ email: "  Ash@Example.COM " }));
    expect(google.read("kofiPayments/txn-1-msg-1")).toMatchObject({ uid: "uid-ash", matchedBy: "email" });
  });

  it("skips the lookup for a blank email", async () => {
    const { post, google } = setup();
    await post(payment({ email: "   " }));
    expect(google.calls.filter((call) => call.url.includes("accounts:lookup"))).toHaveLength(0);
    expect(google.read("kofiPayments/txn-1-msg-1")).toMatchObject({ status: "unmatched" });
  });

  it.each([
    ["an unverified email", { emailVerified: false }],
    ["a disabled account", { disabled: true }],
  ])("does not match %s", async (_label, flags) => {
    const { post, google } = setup();
    google.addUser("ash@example.com", "uid-ash", flags);
    await post(payment());
    expect(google.read("entitlements/uid-ash")).toBeUndefined();
    expect(google.read("kofiPayments/txn-1-msg-1")).toMatchObject({
      status: "unmatched",
      email: "ash@example.com",
    });
  });

  it("does not match when the email belongs to several accounts", async () => {
    const { post, google } = setup();
    google.addUser("ash@example.com", "uid-one");
    google.addUser("ash@example.com", "uid-two");
    await post(payment());
    expect(google.read("kofiPayments/txn-1-msg-1")).toMatchObject({ status: "unmatched" });
    expect(google.docPaths().some((path) => path.startsWith("entitlements/"))).toBe(false);
  });

  it("records unmatched when the lookup answers 400 USER_NOT_FOUND", async () => {
    const { post, google } = setup();
    google.lookupMissAs400(true);
    expect((await post(payment())).status).toBe(200);
    expect(google.read("kofiPayments/txn-1-msg-1")).toMatchObject({
      status: "unmatched",
      email: "ash@example.com",
    });
  });

  it("records unmatched when the lookup rejects a malformed email with 400", async () => {
    const { post, google } = setup();
    google.lookupMissAs400(true);
    expect((await post(payment({ email: "not an email" }))).status).toBe(200);
    expect(google.read("kofiPayments/txn-1-msg-1")).toMatchObject({ status: "unmatched" });
  });

  it("returns 500 when the lookup fails with a server error", async () => {
    const { google } = setup();
    google.addUser("ash@example.com", "uid-ash");
    const original = google.fetch;
    const failing = createReceiver({
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url.includes("accounts:lookup")) return new Response("{}", { status: 503 });
        return original(input, init);
      }) as typeof fetch,
      now: () => NOW,
    });
    const response = await failing(
      new Request("https://worker.example/kofi", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(JSON.stringify(payment()))}`,
      }),
      { KOFI_VERIFICATION_TOKEN: TOKEN, FIREBASE_SERVICE_ACCOUNT: serviceAccount },
    );
    expect(response.status).toBe(500);
  });

  it.each(["bad/uid", "a".repeat(129), "has space", "uid-with-dash"])(
    "ignores a premium code whose uid is %s",
    async (uid) => {
      const { post, google } = setup();
      google.addUser("ash@example.com", "uid-email");
      google.seed("premiumCodes/PD-ABC123", { uid });
      await post(payment({ message: "PD-ABC123" }));
      expect(google.read("kofiPayments/txn-1-msg-1")).toMatchObject({
        uid: "uid-email",
        matchedBy: "email",
      });
      const lookups = google.calls.filter((call) => call.url.includes("accounts:lookup"));
      expect(lookups.map((call) => call.body)).toEqual([{ email: ["ash@example.com"] }]);
    },
  );

  it("accepts a 128 character alphanumeric code uid", async () => {
    const { post, google } = setup();
    const uid = "a1".repeat(64);
    google.addUser("code@example.com", uid);
    google.seed("premiumCodes/PD-ABC123", { uid });
    await post(payment({ message: "PD-ABC123" }));
    expect(google.read("kofiPayments/txn-1-msg-1")).toMatchObject({ uid, matchedBy: "code" });
  });

  it("does not match a lower-case code", async () => {
    const { post, google } = setup();
    google.seed("premiumCodes/PD-ABC123", { uid: "uidcode" });
    await post(payment({ message: "pd-abc123" }));
    expect(google.read("kofiPayments/txn-1-msg-1")).toMatchObject({ status: "unmatched" });
    expect(google.calls.some((call) => call.url.includes("premiumCodes"))).toBe(false);
  });

  it("ignores a code glued to other letters", async () => {
    const { post, google } = setup();
    google.seed("premiumCodes/PD-ABC123", { uid: "uidcode" });
    await post(payment({ message: "XPD-ABC123" }));
    expect(google.read("kofiPayments/txn-1-msg-1")).toMatchObject({ status: "unmatched" });
  });

  it("records unmatched payments with the email kept and no entitlement", async () => {
    const { post, google } = setup();
    const response = await post(payment());
    expect(response.status).toBe(200);
    expect(google.read("kofiPayments/txn-1-msg-1")).toMatchObject({
      status: "unmatched",
      email: "ash@example.com",
      fromName: "Ash Ketchum",
      months: 5,
    });
    expect(google.read("kofiPayments/txn-1-msg-1")).not.toHaveProperty("uid");
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
      google.read("kofiPayments/txn-1-msg-1"),
    ]);
    const second = await post(payment());
    expect(second.status).toBe(200);
    const after = JSON.stringify([
      google.read("entitlements/uid-ash"),
      google.read("tipTotals/2026-11"),
      google.read("kofiPayments/txn-1-msg-1"),
    ]);
    expect(after).toBe(before);
  });

  it("treats ALREADY_EXISTS as a duplicate", async () => {
    const { post, google } = setup();
    google.failCommits(409, { error: { code: 409, status: "ALREADY_EXISTS" } });
    expect(await (await post(payment())).text()).toBe("Duplicate");
  });

  it("returns 500 for a FAILED_PRECONDITION commit", async () => {
    const { post, google } = setup();
    google.failCommits(400, { error: { code: 400, status: "FAILED_PRECONDITION" } });
    expect((await post(payment())).status).toBe(500);
  });

  it("returns 500 for a 409 that is not ALREADY_EXISTS", async () => {
    const { post, google } = setup();
    google.failCommits(409, { error: { code: 409, status: "SOMETHING_ELSE" } });
    expect((await post(payment())).status).toBe(500);
    google.failCommits(409, "not json");
    expect((await post(payment())).status).toBe(500);
  });

  it("returns 500 when a 404 is not NOT_FOUND", async () => {
    const { post, google } = setup();
    google.failReads(404, { error: { code: 404, status: "UNAVAILABLE" } });
    expect((await post(payment({ message: "PD-ABC123" }))).status).toBe(500);
  });

  it("rolls back the transaction when the commit fails", async () => {
    const { post, google } = setup();
    google.addUser("ash@example.com", "uid-ash");
    google.failCommits(500);
    expect((await post(payment())).status).toBe(500);
    expect(google.rollbacks).toHaveLength(1);
    expect(google.calls.filter((call) => call.url.endsWith(":rollback"))).toHaveLength(1);
    expect(google.openTransactions()).toBe(0);
  });

  it("rolls back the transaction when the entitlement read fails", async () => {
    const { post, google } = setup();
    google.addUser("ash@example.com", "uid-ash");
    google.failReads(500, undefined, true);
    expect((await post(payment())).status).toBe(500);
    expect(google.rollbacks).toHaveLength(1);
  });

  it("still returns 500 when the rollback itself fails", async () => {
    const { post, google } = setup();
    google.addUser("ash@example.com", "uid-ash");
    google.failCommits(500);
    google.failRollbacks(500);
    expect((await post(payment())).status).toBe(500);
  });

  it("does not roll back after a successful commit or a duplicate", async () => {
    const { post, google } = setup();
    google.addUser("ash@example.com", "uid-ash");
    expect((await post(payment())).status).toBe(200);
    expect((await post(payment())).status).toBe(200);
    expect(google.rollbacks).toHaveLength(0);
    expect(google.calls.filter((call) => call.url.endsWith(":rollback"))).toHaveLength(0);
    expect(google.openTransactions()).toBe(0);
  });

  it("makes no transaction for a payment that is not eligible", async () => {
    const { post, google } = setup();
    google.addUser("ash@example.com", "uid-ash");
    google.failCommits(500);
    expect((await post(payment({ amount: "0.50" }))).status).toBe(500);
    expect(google.calls.filter((call) => call.url.endsWith(":beginTransaction"))).toHaveLength(0);
    expect(google.rollbacks).toHaveLength(0);
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

  it("refreshes the Google access token once it has expired", async () => {
    const { post, google, advance } = setup();
    google.addUser("ash@example.com", "uid-ash");
    expect((await post(payment())).status).toBe(200);
    advance(3600 * 1000 + 1000);
    const mark = google.calls.length;
    const response = await post(payment({ kofi_transaction_id: "txn-2" }));
    expect(response.status).toBe(200);
    const later = google.calls.slice(mark);
    expect(later[0].url).toBe("https://oauth2.googleapis.com/token");
    for (const call of later.slice(1)) expect(call.authorization).toBe("Bearer access-2");
  });

  it("logs the payment id and the cause of an upstream failure", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { post, google } = setup();
    google.addUser("ash@example.com", "uid-ash");
    google.failCommits(500);
    expect((await post(payment())).status).toBe(500);
    const logged = error.mock.calls.flat().join(" ");
    error.mockRestore();
    expect(logged).toContain("txn-1-msg-1");
    expect(logged).toContain("commit failed: 500");
  });

  it("logs no part of a malformed service account secret", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { receive } = setup();
    const secret =
      '{"private_key":"MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7" "client_email":"x"}';
    const response = await receive(
      new Request("https://worker.example/kofi", {
        method: "POST",
        body: `data=${encodeURIComponent(JSON.stringify(payment()))}`,
        headers: { "content-type": "application/x-www-form-urlencoded" },
      }),
      { KOFI_VERIFICATION_TOKEN: TOKEN, FIREBASE_SERVICE_ACCOUNT: secret },
    );
    const logged = [...error.mock.calls, ...log.mock.calls, ...warn.mock.calls].flat().join(" ");
    error.mockRestore();
    log.mockRestore();
    warn.mockRestore();
    expect(response.status).toBe(500);
    expect(logged).toContain("txn-1-msg-1");
    expect(logged).toContain("SyntaxError");
    expect(logged).not.toContain("MIIEvQIBADAN");
    expect(logged).not.toContain("client_email");
  });

  it("reuses one Google access token across requests", async () => {
    const { post, google } = setup();
    await post(payment());
    await post(payment({ kofi_transaction_id: "txn-2" }));
    const tokenCalls = google.calls.filter((call) => call.url === "https://oauth2.googleapis.com/token");
    expect(tokenCalls).toHaveLength(1);
  });
});

describe("stored text and totals month", () => {
  it("truncates stored strings", async () => {
    const { post, google } = setup();
    await post(
      payment({
        email: `${"e".repeat(400)}@example.com`,
        from_name: "n".repeat(300),
        type: "Donation".padEnd(60, "x"),
        timestamp: "t".repeat(100),
      }),
    );
    const stored = google.read("kofiPayments/txn-1-msg-1");
    expect(String(stored?.email)).toHaveLength(320);
    expect(String(stored?.fromName)).toHaveLength(200);
    expect(String(stored?.type)).toHaveLength(32);
    expect(String(stored?.kofiTimestamp)).toHaveLength(64);
  });

  it("keeps strings at the limit whole", async () => {
    const { post, google } = setup();
    await post(payment({ email: "e".repeat(320), from_name: "n".repeat(200) }));
    const stored = google.read("kofiPayments/txn-1-msg-1");
    expect(String(stored?.email)).toHaveLength(320);
    expect(String(stored?.fromName)).toHaveLength(200);
  });

  it("does not split a surrogate pair when truncating", async () => {
    const { post, google } = setup();
    await post(payment({ from_name: "\u{1F600}".repeat(250) }));
    const stored = String(google.read("kofiPayments/txn-1-msg-1")?.fromName);
    expect(Array.from(stored)).toHaveLength(200);
    expect(() => encodeURIComponent(stored)).not.toThrow();
  });

  it("uses the Ko-fi timestamp for the totals month when it is within two days", async () => {
    const { post, google } = setup(new Date("2026-12-01T00:00:00.000Z"));
    await post(payment({ timestamp: "2026-11-29T00:00:00Z" }));
    expect(google.read("tipTotals/2026-11")).toEqual({ amountPence: 500, count: 1 });
    expect(google.read("tipTotals/2026-12")).toBeUndefined();
  });

  it("uses the Ko-fi timestamp when it is just ahead of now", async () => {
    const { post, google } = setup(new Date("2026-11-30T00:00:00.000Z"));
    await post(payment({ timestamp: "2026-12-02T00:00:00Z" }));
    expect(google.read("tipTotals/2026-12")).toEqual({ amountPence: 500, count: 1 });
  });

  it("falls back to now when the Ko-fi timestamp is too far ahead", async () => {
    const { post, google } = setup(new Date("2026-11-30T00:00:00.000Z"));
    await post(payment({ timestamp: "2026-12-02T00:00:01Z" }));
    expect(google.read("tipTotals/2026-11")).toEqual({ amountPence: 500, count: 1 });
    expect(google.read("tipTotals/2026-12")).toBeUndefined();
  });

  it.each([
    ["too old", "2026-11-28T23:59:59Z"],
    ["unparseable", "yesterday-ish"],
    ["empty", ""],
  ])("falls back to now when the Ko-fi timestamp is %s", async (_label, timestamp) => {
    const { post, google } = setup(new Date("2026-12-01T00:00:00.000Z"));
    await post(payment({ timestamp }));
    expect(google.read("tipTotals/2026-12")).toEqual({ amountPence: 500, count: 1 });
    expect(google.read("tipTotals/2026-11")).toBeUndefined();
  });
});
