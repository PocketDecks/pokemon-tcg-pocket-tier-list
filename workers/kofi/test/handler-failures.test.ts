import { describe, expect, it, vi } from "vitest";
import { createReceiver } from "../src/handler";
import { TOKEN, NOW, keys, serviceAccount, payment, setup } from "./handler-fixtures";

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

  it("does not roll back after a successful commit", async () => {
    const { post, google } = setup();
    google.addUser("ash@example.com", "uid-ash");
    expect((await post(payment())).status).toBe(200);
    expect(google.rollbacks).toHaveLength(0);
    expect(google.calls.filter((call) => call.url.endsWith(":rollback"))).toHaveLength(0);
    expect(google.openTransactions()).toBe(0);
  });

  it("rolls back once after a duplicate commit and ignores a rollback error", async () => {
    const { post, google } = setup();
    google.addUser("ash@example.com", "uid-ash");
    expect((await post(payment())).status).toBe(200);
    expect(google.rollbacks).toHaveLength(0);
    google.failRollbacks(500);
    const second = await post(payment());
    expect(second.status).toBe(200);
    expect(await second.text()).toBe("Duplicate");
    expect(google.rollbacks).toHaveLength(1);
    expect(google.calls.filter((call) => call.url.endsWith(":rollback"))).toHaveLength(1);
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

  it("fetches a fresh token after Google rejects the cached one", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { post, google } = setup();
    google.addUser("ash@example.com", "uid-ash");
    expect((await post(payment({ message_id: "msg-a" }))).status).toBe(200);
    google.revokeTokens();
    expect((await post(payment({ message_id: "msg-b" }))).status).toBe(500);
    expect((await post(payment({ message_id: "msg-b" }))).status).toBe(200);
    error.mockRestore();
    expect(google.read("kofiPayments/txn-1-msg-b")).toMatchObject({ status: "granted" });
  });

  it("stores the currency upper-cased, well-formed and cut to eight characters", async () => {
    const { post, google } = setup();
    await post(payment({ currency: `us\uD800${"d".repeat(40)}` }));
    expect(google.read("kofiPayments/txn-1-msg-1")).toMatchObject({
      status: "needs-review",
      currency: "US�DDDDD",
    });
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

  it("logs the status of a failed token exchange and nothing from the assertion or key", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { google } = setup();
    const seen: string[] = [];
    const receive = createReceiver({
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url === "https://oauth2.googleapis.com/token") {
          seen.push(String(init?.body));
          return new Response("denied", { status: 401 });
        }
        return google.fetch(input, init);
      }) as typeof fetch,
      now: () => NOW,
    });
    google.addUser("ash@example.com", "uid-ash");
    const response = await receive(
      new Request("https://worker.example/kofi", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(JSON.stringify(payment()))}`,
      }),
      { KOFI_VERIFICATION_TOKEN: TOKEN, FIREBASE_SERVICE_ACCOUNT: serviceAccount },
    );
    const logged = error.mock.calls.flat().join(" ");
    error.mockRestore();
    expect(response.status).toBe(500);
    expect(logged).toContain("token exchange failed: 401");
    const assertion = new URLSearchParams(seen[0]).get("assertion") ?? "";
    expect(assertion.length).toBeGreaterThan(0);
    expect(logged).not.toContain(assertion);
    expect(logged).not.toContain("BEGIN PRIVATE KEY");
    expect(logged).not.toContain(keys.privateKeyPem.split("\n")[1]);
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

  it("replaces a lone high surrogate with U+FFFD", async () => {
    const { post, google } = setup();
    await post(payment({ from_name: "Ash\uD800Ketchum" }));
    expect(google.read("kofiPayments/txn-1-msg-1")?.fromName).toBe("Ash\uFFFDKetchum");
  });

  it("replaces a lone low surrogate with U+FFFD", async () => {
    const { post, google } = setup();
    await post(payment({ from_name: "Ash\uDC00Ketchum" }));
    expect(google.read("kofiPayments/txn-1-msg-1")?.fromName).toBe("Ash\uFFFDKetchum");
  });

  it("makes every stored string well formed", async () => {
    const { post, google } = setup();
    await post(
      payment({
        email: "a\uD800@example.com",
        type: "Donation\uDC00",
        timestamp: "2026\uD800",
      }),
    );
    const stored = google.read("kofiPayments/txn-1-msg-1");
    expect(stored?.email).toBe("a\uFFFD@example.com");
    expect(stored?.type).toBe("Donation\uFFFD");
    expect(stored?.kofiTimestamp).toBe("2026\uFFFD");
  });

  it("leaves a valid emoji untouched", async () => {
    const { post, google } = setup();
    await post(payment({ from_name: "Ash \u{1F600}" }));
    expect(google.read("kofiPayments/txn-1-msg-1")?.fromName).toBe("Ash \u{1F600}");
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
