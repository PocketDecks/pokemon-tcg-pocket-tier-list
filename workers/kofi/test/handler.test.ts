import { describe, expect, it } from "vitest";
import { NOW, payment, setup } from "./handler-fixtures";

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

  it("treats a timestamp Firestore returns but Date cannot parse as expired", async () => {
    const { post, google } = setup();
    google.addUser("ash@example.com", "uid-ash");
    google.seed("entitlements/uid-ash", {
      premium: true,
      source: "manual",
      expiresAt: { timestampValue: "not-a-timestamp" },
    });
    await post(payment({ amount: "1.00" }));
    expect(google.read("kofiPayments/txn-1-msg-1")).toMatchObject({ status: "granted" });
    expect(google.read("entitlements/uid-ash")).toMatchObject({
      source: "kofi",
      expiresAt: "2026-12-08T12:00:00.000Z",
    });
  });

  it("treats an expiry in the year 9999 as lifetime and writes no entitlement", async () => {
    const { post, google } = setup();
    google.addUser("ash@example.com", "uid-ash");
    google.seed("entitlements/uid-ash", {
      premium: true,
      source: "manual",
      expiresAt: new Date("9999-12-31T00:00:00.000Z"),
    });
    const response = await post(payment());
    expect(response.status).toBe(200);
    expect(google.read("kofiPayments/txn-1-msg-1")).toMatchObject({ status: "already-lifetime" });
    expect(google.read("entitlements/uid-ash")).toEqual({
      premium: true,
      source: "manual",
      expiresAt: "9999-12-31T00:00:00.000Z",
    });
    expect(
      google.commitWrites.flat().some((write) => {
        const update = write.update as { name: string } | undefined;
        return update?.name.endsWith("entitlements/uid-ash");
      }),
    ).toBe(false);
  });

  it("still stacks onto an expiry in 2099", async () => {
    const { post, google } = setup();
    google.addUser("ash@example.com", "uid-ash");
    google.seed("entitlements/uid-ash", {
      premium: true,
      source: "kofi",
      expiresAt: new Date("2099-12-31T00:00:00.000Z"),
    });
    await post(payment({ amount: "1.00" }));
    expect(google.read("entitlements/uid-ash")?.expiresAt).toBe("2100-01-31T00:00:00.000Z");
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
    await post(payment({ kofi_transaction_id: "txn-warm", amount: "0.50" }));
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
    expect(google.read("tipTotals/2026-11")).toEqual({ amountPence: 850, count: 3 });
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
