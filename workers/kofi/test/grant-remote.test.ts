import { describe, expect, it, vi } from "vitest";
import { runRemoteGrant, RemoteGrantError } from "../scripts/grant-remote";
import { ManualGrantRefusal } from "../src/manual-grant";

const TOKEN = "test-admin-token-0123456789abcdef-test";
const BASE = "https://worker.example";

const outcomeBody = {
  payment: "p1",
  uid: "uid123",
  months: 5,
  status: "granted",
  previousExpiry: "2026-12-31T00:00:00.000Z",
  newExpiry: "2027-05-31T00:00:00.000Z",
  dryRun: true,
};

const respond = (status: number, body: unknown) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

const run = (
  response: Response | Error,
  overrides: Partial<Parameters<typeof runRemoteGrant>[0]> = {},
) => {
  const fetchSpy = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  const promise = runRemoteGrant({
    url: BASE,
    token: TOKEN,
    paymentId: "p1",
    uid: "uid123",
    dryRun: true,
    fetch: fetchSpy as unknown as typeof fetch,
    ...overrides,
  });
  return { promise, fetchSpy };
};

const failure = (promise: Promise<unknown>) => promise.catch((caught: unknown) => caught);

describe("runRemoteGrant", () => {
  it("posts the request with the bearer token", async () => {
    const { promise, fetchSpy } = run(respond(200, outcomeBody), { months: 5 });
    await promise;
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE}/admin/grant`);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(init.body as string)).toEqual({
      payment: "p1",
      uid: "uid123",
      months: 5,
      dryRun: true,
    });
  });

  it("sends an email instead of a uid", async () => {
    const { promise, fetchSpy } = run(respond(200, outcomeBody), {
      uid: undefined,
      email: "a@b.co",
    });
    await promise;
    const [, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      payment: "p1",
      email: "a@b.co",
      dryRun: true,
    });
  });

  it("returns the outcome with dates", async () => {
    const outcome = await run(respond(200, outcomeBody)).promise;
    expect(outcome.previousExpiry).toEqual(new Date("2026-12-31T00:00:00.000Z"));
    expect(outcome.newExpiry).toEqual(new Date("2027-05-31T00:00:00.000Z"));
    expect(outcome).toMatchObject({ paymentId: "p1", uid: "uid123", months: 5, dryRun: true });
  });

  it("keeps null expiries null", async () => {
    const outcome = await run(
      respond(200, {
        ...outcomeBody,
        previousExpiry: null,
        newExpiry: null,
        status: "already-lifetime",
      }),
    ).promise;
    expect(outcome.previousExpiry).toBeNull();
    expect(outcome.newExpiry).toBeNull();
  });

  it("turns a 409 into a refusal with the Worker message", async () => {
    const error = await failure(run(respond(409, { error: "Payment p1 has status granted" })).promise);
    expect(error).toBeInstanceOf(ManualGrantRefusal);
    expect((error as Error).message).toBe("Payment p1 has status granted");
  });

  it("turns a 404 with an error body into a refusal", async () => {
    const error = await failure(
      run(respond(404, { error: "no single verified, enabled account for that email" })).promise,
    );
    expect(error).toBeInstanceOf(ManualGrantRefusal);
  });

  it("explains a 404 with no JSON body", async () => {
    const error = await failure(run(respond(404, "Not found")).promise);
    expect(error).toBeInstanceOf(RemoteGrantError);
    expect((error as Error).message).toContain("404");
  });

  it("explains a 401 without echoing the token", async () => {
    const error = await failure(run(respond(401, "Unauthorised")).promise);
    expect(error).toBeInstanceOf(RemoteGrantError);
    expect((error as Error).message).toContain("401");
    expect((error as Error).message).not.toContain(TOKEN);
  });

  it.each([400, 413, 500, 502])("fails on %i", async (status) => {
    const error = await failure(run(respond(status, "x")).promise);
    expect(error).toBeInstanceOf(RemoteGrantError);
    expect((error as Error).message).toContain(String(status));
  });

  it("fails on a malformed success body", async () => {
    const error = await failure(run(respond(200, "nope")).promise);
    expect(error).toBeInstanceOf(RemoteGrantError);
  });

  it("fails on a network error without echoing the token", async () => {
    const error = await failure(run(new TypeError(`connect failed ${TOKEN}`)).promise);
    expect(error).toBeInstanceOf(RemoteGrantError);
    expect((error as Error).message).not.toContain(TOKEN);
  });
});
