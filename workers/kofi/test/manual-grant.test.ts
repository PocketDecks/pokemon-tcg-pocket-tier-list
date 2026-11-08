import { describe, expect, it } from "vitest";
import { createFirestoreClient } from "../src/firestore";
import { createTokenProvider, parseServiceAccount } from "../src/google-auth";
import { grantManually, ManualGrantRefusal, resolveGrantUid } from "../src/manual-grant";
import { createFakeGoogle } from "./fake-google";
import { keys, NOW, serviceAccount } from "./handler-fixtures";

const PAYMENT = "txn-1-msg-1";
const UID = "uid123";

type Fake = ReturnType<typeof createFakeGoogle>;

const urlOf = (input: RequestInfo | URL): string =>
  typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

const setup = (beforeCommit?: (google: Fake) => void) => {
  const google = createFakeGoogle({ publicKey: keys.publicKey, now: () => NOW.getTime() });
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (beforeCommit && urlOf(input).endsWith(":commit")) beforeCommit(google);
    return google.fetch(input, init);
  }) as typeof fetch;
  const account = parseServiceAccount(serviceAccount);
  const getToken = createTokenProvider({
    serviceAccount: account,
    fetch: fetchImpl,
    now: () => NOW.getTime(),
  });
  const client = createFirestoreClient({
    projectId: account.projectId,
    getToken,
    onUnauthorised: getToken.invalidate,
    fetch: fetchImpl,
  });
  google.addUser("ash@example.com", UID);
  google.seed(`kofiPayments/${PAYMENT}`, {
    status: "unmatched",
    months: 5,
    amountPence: 500,
    currency: "GBP",
    email: "ash@example.com",
  });
  const lookup = (target: { uid?: string; email?: string }) => resolveGrantUid(client, target);
  const run = (overrides: Partial<Parameters<typeof grantManually>[0]> = {}) =>
    grantManually({
      client,
      paymentId: PAYMENT,
      uid: UID,
      dryRun: false,
      now: NOW,
      ...overrides,
    });
  return { google, run, lookup };
};

const seedNeedsReview = (google: Fake, months = 0) => {
  google.seed(`kofiPayments/${PAYMENT}`, {
    status: "needs-review",
    months,
    amountPence: 1000,
    currency: "USD",
  });
};

describe("grantManually", () => {
  it("grants months to a user with no entitlement", async () => {
    const { google, run } = setup();
    const outcome = await run();
    expect(outcome).toMatchObject({
      paymentId: PAYMENT,
      uid: UID,
      months: 5,
      status: "granted",
      previousExpiry: null,
      dryRun: false,
    });
    expect(outcome.newExpiry?.toISOString()).toBe("2027-04-08T12:00:00.000Z");
    expect(google.read(`entitlements/${UID}`)).toMatchObject({
      premium: true,
      source: "kofi",
      expiresAt: "2027-04-08T12:00:00.000Z",
      updatedAt: NOW.toISOString(),
    });
    expect(google.read(`kofiPayments/${PAYMENT}`)).toMatchObject({
      status: "granted",
      uid: UID,
      matchedBy: "manual",
      months: 5,
      grantedAt: NOW.toISOString(),
      email: "ash@example.com",
    });
    expect(google.docPaths().some((path) => path.startsWith("tipTotals/"))).toBe(false);
    expect(google.commitWrites).toHaveLength(1);
    expect(google.openTransactions()).toBe(0);
  });

  it("stacks onto an active expiry", async () => {
    const { google, run } = setup();
    google.seed(`entitlements/${UID}`, {
      premium: true,
      source: "kofi",
      expiresAt: new Date("2026-12-31T00:00:00.000Z"),
    });
    const outcome = await run();
    expect(outcome.previousExpiry?.toISOString()).toBe("2026-12-31T00:00:00.000Z");
    expect(outcome.newExpiry?.toISOString()).toBe("2027-05-31T00:00:00.000Z");
    expect(google.read(`entitlements/${UID}`)?.expiresAt).toBe("2027-05-31T00:00:00.000Z");
  });

  it("restarts from now when the expiry has passed", async () => {
    const { google, run } = setup();
    google.seed(`entitlements/${UID}`, {
      premium: true,
      source: "kofi",
      expiresAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const outcome = await run();
    expect(outcome.newExpiry?.toISOString()).toBe("2027-04-08T12:00:00.000Z");
  });

  it("leaves a lifetime entitlement alone and marks the payment", async () => {
    const { google, run } = setup();
    google.seed(`entitlements/${UID}`, { premium: true, source: "manual", expiresAt: null });
    const outcome = await run();
    expect(outcome.status).toBe("already-lifetime");
    expect(outcome.newExpiry).toBeNull();
    expect(google.read(`entitlements/${UID}`)).toEqual({
      premium: true,
      source: "manual",
      expiresAt: null,
    });
    expect(google.read(`kofiPayments/${PAYMENT}`)).toMatchObject({
      status: "already-lifetime",
      uid: UID,
      matchedBy: "manual",
      months: 5,
    });
  });

  it.each(["granted", "already-lifetime"])("refuses a payment that is %s", async (status) => {
    const { google, run } = setup();
    google.seed(`kofiPayments/${PAYMENT}`, { status, months: 5 });
    await expect(run()).rejects.toBeInstanceOf(ManualGrantRefusal);
    expect(google.commitWrites).toHaveLength(0);
    expect(google.read(`entitlements/${UID}`)).toBeUndefined();
    expect(google.openTransactions()).toBe(0);
  });

  it("refuses a missing payment", async () => {
    const { google, run } = setup();
    await expect(run({ paymentId: "nothing-here" })).rejects.toThrow(/does not exist/);
    expect(google.commitWrites).toHaveLength(0);
    expect(google.openTransactions()).toBe(0);
  });

  it.each(["", "a/b", "__x__", "a b"])("refuses the payment id %j without calling Google", async (paymentId) => {
    const { google, run } = setup();
    await expect(run({ paymentId })).rejects.toBeInstanceOf(ManualGrantRefusal);
    expect(google.calls).toHaveLength(0);
  });

  it("refuses a second run after success", async () => {
    const { google, run } = setup();
    await run();
    const before = google.read(`entitlements/${UID}`);
    await expect(run()).rejects.toBeInstanceOf(ManualGrantRefusal);
    expect(google.read(`entitlements/${UID}`)).toEqual(before);
    expect(google.commitWrites).toHaveLength(1);
  });

  describe("months", () => {
    it("requires --months for a needs-review payment", async () => {
      const { google, run } = setup();
      seedNeedsReview(google);
      await expect(run()).rejects.toThrow(/--months/);
      expect(google.commitWrites).toHaveLength(0);
    });

    it("grants a needs-review payment with --months", async () => {
      const { google, run } = setup();
      seedNeedsReview(google);
      const outcome = await run({ months: 3 });
      expect(outcome.months).toBe(3);
      expect(outcome.newExpiry?.toISOString()).toBe("2027-02-08T12:00:00.000Z");
      expect(google.read(`kofiPayments/${PAYMENT}`)).toMatchObject({
        status: "granted",
        months: 3,
        matchedBy: "manual",
      });
    });

    it.each([0, 121, 1.5, Number.NaN, -2])("rejects --months %s", async (months) => {
      const { google, run } = setup();
      seedNeedsReview(google);
      await expect(run({ months })).rejects.toBeInstanceOf(ManualGrantRefusal);
      expect(google.commitWrites).toHaveLength(0);
    });

    it("rejects --months that differs from the stored months", async () => {
      const { google, run } = setup();
      await expect(run({ months: 4 })).rejects.toThrow(/5/);
      expect(google.commitWrites).toHaveLength(0);
    });

    it("accepts --months that matches the stored months", async () => {
      const { run } = setup();
      const outcome = await run({ months: 5 });
      expect(outcome.months).toBe(5);
    });

    it("ignores an out-of-range stored value and uses --months", async () => {
      const { google, run } = setup();
      seedNeedsReview(google, 500);
      const outcome = await run({ months: 2 });
      expect(outcome.months).toBe(2);
    });
  });

  describe("uid", () => {
    it.each(["", "a/b", "uid-1", "x".repeat(129), "uid 1"])("rejects %j", async (uid) => {
      const { google, run } = setup();
      await expect(run({ uid })).rejects.toBeInstanceOf(ManualGrantRefusal);
      expect(google.commitWrites).toHaveLength(0);
    });

    it("rejects a missing account", async () => {
      const { google, run } = setup();
      await expect(run({ uid: "someoneelse" })).rejects.toThrow(/account/);
      expect(google.commitWrites).toHaveLength(0);
      expect(google.openTransactions()).toBe(0);
    });

    it("rejects a disabled account", async () => {
      const { google, run } = setup();
      google.addUser("off@example.com", "disabled1", { disabled: true });
      await expect(run({ uid: "disabled1" })).rejects.toThrow(/account/);
      expect(google.commitWrites).toHaveLength(0);
    });
  });

  it("aborts when the entitlement changes between the read and the commit", async () => {
    const { google, run } = setup((fake) => {
      fake.seed(`entitlements/${UID}`, {
        premium: true,
        source: "kofi",
        expiresAt: new Date("2027-01-01T00:00:00.000Z"),
      });
    });
    await expect(run()).rejects.toThrow(/commit failed: 409/);
    expect(google.read(`entitlements/${UID}`)?.expiresAt).toBe("2027-01-01T00:00:00.000Z");
    expect(google.read(`kofiPayments/${PAYMENT}`)).toMatchObject({ status: "unmatched" });
    expect(google.commitWrites).toHaveLength(0);
    expect(google.rollbacks).toHaveLength(1);
  });

  it("rolls back and rethrows when the commit fails", async () => {
    const { google, run } = setup();
    google.failCommits(500);
    await expect(run()).rejects.toThrow(/commit failed: 500/);
    expect(google.rollbacks).toHaveLength(1);
    expect(google.read(`kofiPayments/${PAYMENT}`)).toMatchObject({ status: "unmatched" });
  });

  it("writes nothing on a dry run", async () => {
    const { google, run } = setup();
    const outcome = await run({ dryRun: true });
    expect(outcome).toMatchObject({ status: "granted", dryRun: true, months: 5 });
    expect(outcome.newExpiry?.toISOString()).toBe("2027-04-08T12:00:00.000Z");
    expect(google.commitWrites).toHaveLength(0);
    expect(google.read(`entitlements/${UID}`)).toBeUndefined();
    expect(google.read(`kofiPayments/${PAYMENT}`)).toMatchObject({ status: "unmatched" });
    expect(google.rollbacks).toHaveLength(1);
    expect(google.openTransactions()).toBe(0);
  });

  it("allows a real run after a dry run", async () => {
    const { run } = setup();
    await run({ dryRun: true });
    const outcome = await run();
    expect(outcome.status).toBe("granted");
  });
});

describe("resolveGrantUid", () => {
  it("returns a uid unchanged", async () => {
    const { lookup } = setup();
    expect(await lookup({ uid: UID })).toBe(UID);
  });

  it("resolves a trimmed, lower-cased email", async () => {
    const { lookup } = setup();
    expect(await lookup({ email: "  ASH@Example.com " })).toBe(UID);
  });

  it("returns null when no single verified, enabled account matches", async () => {
    const { google, lookup } = setup();
    google.addUser("dup@example.com", "uidA");
    google.addUser("dup@example.com", "uidB");
    google.addUser("off@example.com", "uidC", { disabled: true });
    google.addUser("unv@example.com", "uidD", { emailVerified: false });
    const emails = ["nobody@example.com", "dup@example.com", "off@example.com", "unv@example.com"];
    for (const email of emails) {
      expect(await lookup({ email })).toBeNull();
    }
  });

  it("returns null when neither is given", async () => {
    const { lookup } = setup();
    expect(await lookup({})).toBeNull();
  });
});
