import { afterEach, describe, expect, it, vi } from "vitest";
import { NOW, setup } from "./handler-fixtures";

const ADMIN = "test-admin-token-0123456789abcdef-test";
const PAYMENT = "txn-1-msg-1";
const UID = "uid123";
const EMAIL = "ash@example.com";

interface CallOptions {
  token?: string | null;
  secret?: string;
  headers?: Record<string, string>;
}

const prepare = () => {
  const ctx = setup();
  ctx.google.addUser(EMAIL, UID);
  ctx.google.seed(`kofiPayments/${PAYMENT}`, {
    status: "unmatched",
    months: 5,
    amountPence: 500,
    currency: "GBP",
    email: EMAIL,
  });
  const call = (body: unknown, options: CallOptions = {}) => {
    const token = options.token === undefined ? ADMIN : options.token;
    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...options.headers,
    };
    if (token !== null) headers.authorization = `Bearer ${token}`;
    const env = {
      ...ctx.env,
      KOFI_ADMIN_TOKEN: "secret" in options ? options.secret : ADMIN,
    };
    return ctx.receive(
      new Request("https://worker.example/admin/grant", {
        method: "POST",
        headers,
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
      env as typeof ctx.env,
    );
  };
  return { ...ctx, call };
};

const logged = () =>
  [...vi.mocked(console.log).mock.calls, ...vi.mocked(console.error).mock.calls]
    .flat()
    .join("\n");

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /admin/grant", () => {
  it.each([undefined, "", "short-secret", "x".repeat(31)])(
    "answers 404 when the secret is %j",
    async (secret) => {
      const { call, fetchSpy } = prepare();
      const response = await call({ payment: PAYMENT, uid: UID }, { secret });
      expect(response.status).toBe(404);
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it("answers 404 for other methods", async () => {
    const { receive, env } = prepare();
    const response = await receive(new Request("https://worker.example/admin/grant"), {
      ...env,
      KOFI_ADMIN_TOKEN: ADMIN,
    } as typeof env);
    expect(response.status).toBe(404);
  });

  it.each([
    ["a missing token", null],
    ["a wrong token", `${ADMIN}x`],
    ["an empty token", ""],
  ])("answers 401 for %s and makes no Google call", async (_label, token) => {
    const { call, fetchSpy, google } = prepare();
    const response = await call({ payment: PAYMENT, uid: UID }, { token });
    expect(response.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(google.commitWrites).toHaveLength(0);
  });

  it("answers 401 for a non-bearer scheme", async () => {
    const { call, fetchSpy } = prepare();
    const response = await call(
      { payment: PAYMENT, uid: UID },
      { token: null, headers: { authorization: `Basic ${ADMIN}` } },
    );
    expect(response.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("checks the token before the body size", async () => {
    const { call, fetchSpy } = prepare();
    const response = await call("x".repeat(20000), { token: "wrong" });
    expect(response.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("answers 413 over the body limit", async () => {
    const { call, fetchSpy } = prepare();
    const response = await call("x".repeat(16385));
    expect(response.status).toBe(413);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed JSON", "{nope"],
    ["a JSON array", []],
    ["a missing payment", { uid: UID }],
    ["an unsafe payment id", { payment: "../x", uid: UID }],
    ["neither uid nor email", { payment: PAYMENT }],
    ["both uid and email", { payment: PAYMENT, uid: UID, email: EMAIL }],
    ["a non-string uid", { payment: PAYMENT, uid: 5 }],
    ["an unsafe uid", { payment: PAYMENT, uid: "a/b" }],
    ["a blank email", { payment: PAYMENT, email: "   " }],
    ["a non-string email", { payment: PAYMENT, email: 5 }],
    ["fractional months", { payment: PAYMENT, uid: UID, months: 1.5 }],
    ["zero months", { payment: PAYMENT, uid: UID, months: 0 }],
    ["too many months", { payment: PAYMENT, uid: UID, months: 121 }],
    ["string months", { payment: PAYMENT, uid: UID, months: "5" }],
    ["a non-boolean dryRun", { payment: PAYMENT, uid: UID, dryRun: "yes" }],
  ])("answers 400 for %s", async (_label, body) => {
    const { call, fetchSpy } = prepare();
    const response = await call(body);
    expect(response.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("answers 404 for an email with no single verified, enabled account", async () => {
    const { call, google } = prepare();
    const response = await call({ payment: PAYMENT, email: "nobody@example.com" });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "no single verified, enabled account for that email",
    });
    expect(google.commitWrites).toHaveLength(0);
  });

  it("answers 404 for an unverified account", async () => {
    const { call, google } = prepare();
    google.addUser("new@example.com", "uid999", { emailVerified: false });
    const response = await call({ payment: PAYMENT, email: "new@example.com" });
    expect(response.status).toBe(404);
  });

  it("answers 409 for a payment already granted", async () => {
    const { call, google } = prepare();
    google.seed(`kofiPayments/${PAYMENT}`, { status: "granted", months: 5 });
    const response = await call({ payment: PAYMENT, uid: UID });
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("granted");
    expect(google.commitWrites).toHaveLength(0);
  });

  it("answers 409 for a missing payment", async () => {
    const { call } = prepare();
    const response = await call({ payment: "nope-1", uid: UID });
    expect(response.status).toBe(409);
  });

  it("answers 409 for a uid with no active account", async () => {
    const { call } = prepare();
    const response = await call({ payment: PAYMENT, uid: "ghost1" });
    expect(response.status).toBe(409);
  });

  it("grants by uid", async () => {
    const { call, google } = prepare();
    const response = await call({ payment: PAYMENT, uid: UID });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      payment: PAYMENT,
      uid: UID,
      months: 5,
      status: "granted",
      previousExpiry: null,
      newExpiry: "2027-04-08T12:00:00.000Z",
      dryRun: false,
    });
    expect(google.read(`entitlements/${UID}`)).toMatchObject({
      premium: true,
      source: "kofi",
      expiresAt: "2027-04-08T12:00:00.000Z",
    });
    expect(google.read(`kofiPayments/${PAYMENT}`)).toMatchObject({
      status: "granted",
      matchedBy: "manual",
      grantedAt: NOW.toISOString(),
    });
  });

  it("grants by email, trimmed and lower-cased", async () => {
    const { call, google } = prepare();
    const response = await call({ payment: PAYMENT, email: "  ASH@Example.com " });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ uid: UID, status: "granted", dryRun: false });
    expect(google.read(`kofiPayments/${PAYMENT}`)).toMatchObject({ status: "granted", uid: UID });
  });

  it("reports the previous expiry", async () => {
    const { call, google } = prepare();
    google.seed(`entitlements/${UID}`, {
      premium: true,
      source: "kofi",
      expiresAt: new Date("2026-12-31T00:00:00.000Z"),
    });
    const body = (await (await call({ payment: PAYMENT, uid: UID })).json()) as Record<
      string,
      unknown
    >;
    expect(body.previousExpiry).toBe("2026-12-31T00:00:00.000Z");
    expect(body.newExpiry).toBe("2027-05-31T00:00:00.000Z");
  });

  it("uses a months override when the payment stores none", async () => {
    const { call, google } = prepare();
    google.seed(`kofiPayments/${PAYMENT}`, { status: "needs-review", months: 0 });
    const response = await call({ payment: PAYMENT, uid: UID, months: 3 });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ months: 3 });
  });

  it("writes nothing on a dry run", async () => {
    const { call, google } = prepare();
    const response = await call({ payment: PAYMENT, email: EMAIL, dryRun: true });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ dryRun: true, status: "granted" });
    expect(google.commitWrites).toHaveLength(0);
    expect(google.read(`entitlements/${UID}`)).toBeUndefined();
    expect(google.read(`kofiPayments/${PAYMENT}`)).toMatchObject({ status: "unmatched" });
  });

  it("answers 500 with no detail when Google fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { call, google } = prepare();
    google.failCommits(500);
    const response = await call({ payment: PAYMENT, uid: UID });
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("commit failed");
  });

  it("never lets the token, the email or the key reach a log or a response", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { call, google, env } = prepare();
    const texts: string[] = [];
    texts.push(await (await call({ payment: PAYMENT, email: EMAIL, dryRun: true })).text());
    texts.push(await (await call({ payment: PAYMENT, email: EMAIL })).text());
    texts.push(await (await call({ payment: PAYMENT, email: EMAIL })).text());
    texts.push(await (await call({ payment: PAYMENT, email: "nobody@example.com" })).text());
    texts.push(await (await call({ payment: PAYMENT, uid: UID }, { token: "wrong-token" })).text());
    google.failCommits(500);
    google.seed("kofiPayments/other-1", { status: "unmatched", months: 2 });
    texts.push(await (await call({ payment: "other-1", uid: UID })).text());
    const everything = `${texts.join("\n")}\n${logged()}`;
    expect(everything).not.toContain(ADMIN);
    expect(everything).not.toContain("wrong-token");
    expect(everything).not.toContain(EMAIL);
    expect(everything).not.toContain("nobody@example.com");
    expect(everything).not.toContain("PRIVATE KEY");
    expect(everything).not.toContain(env.FIREBASE_SERVICE_ACCOUNT);
    expect(logged()).toContain(PAYMENT);
  });
});
