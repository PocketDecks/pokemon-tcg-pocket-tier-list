import { describe, expect, it } from "vitest";
import { createReceiver } from "../src/handler";
import { createFakeGoogle } from "./fake-google";
import { TOKEN, NOW, serviceAccount, payment, setup } from "./handler-fixtures";

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

  it("matches a lower-case code after normalising it", async () => {
    const { post, google } = setup();
    google.addUser("code@example.com", "uidcode");
    google.seed("premiumCodes/PD-ABC123", { uid: "uidcode" });
    await post(payment({ message: "pd-abc123" }));
    expect(google.read("kofiPayments/txn-1-msg-1")).toMatchObject({
      uid: "uidcode",
      matchedBy: "code",
    });
    expect(google.calls.some((call) => call.url.includes("premiumCodes"))).toBe(true);
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

describe("review data", () => {
  it("stacks onto the right entitlement when the uid holds URL characters", async () => {
    const { post, google } = setup();
    google.addUser("ash@example.com", "ash#1");
    google.seed("entitlements/ash#1", {
      premium: true,
      expiresAt: new Date("2027-03-08T12:00:00.000Z"),
    });
    expect((await post(payment())).status).toBe(200);
    expect(google.read("entitlements/ash#1")?.expiresAt).toBe("2027-08-08T12:00:00.000Z");
    expect(google.docPaths()).not.toContain("entitlements/ash");
  });

  it("leaves a payment unmatched when the email belongs to a uid with a slash", async () => {
    const { post, google } = setup();
    google.addUser("ash@example.com", "ash/1");
    expect((await post(payment())).status).toBe(200);
    expect(google.read("kofiPayments/txn-1-msg-1")).toMatchObject({ status: "unmatched" });
    expect(google.docPaths().some((path) => path.startsWith("entitlements/"))).toBe(false);
  });

  it("keeps the message on payments it did not grant, cut to 500 characters", async () => {
    const { post, google } = setup();
    await post(payment({ currency: "USD", message: `my account is ash@pocket.test ${"x".repeat(600)}` }));
    const stored = google.read("kofiPayments/txn-1-msg-1");
    expect(String(stored?.message)).toMatch(/^my account is ash@pocket\.test x+$/);
    expect(Array.from(String(stored?.message))).toHaveLength(500);
  });

  it("does not keep the message on a granted payment", async () => {
    const { post, google } = setup();
    google.addUser("ash@example.com", "uidash");
    await post(payment());
    expect(google.read("kofiPayments/txn-1-msg-1")).not.toHaveProperty("message");
  });
});
