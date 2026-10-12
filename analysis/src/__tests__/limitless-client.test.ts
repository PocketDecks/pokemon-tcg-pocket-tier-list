import { vi } from "vitest";
import {
  BASE_DELAY_MS,
  LimitlessError,
  MAX_ATTEMPTS,
  fetchLimitless,
  mapWithConcurrency,
} from "../utils/limitless-client";

const KEY = "secret-test-key";

const ok = (body: unknown) => ({
  ok: true,
  status: 200,
  statusText: "OK",
  headers: new Headers(),
  json: async () => body,
});

const fail = (status: number, headers: Record<string, string> = {}) => ({
  ok: false,
  status,
  statusText: "Failure",
  headers: new Headers(headers),
  json: async () => ({}),
});

const asFetch = (mock: ReturnType<typeof vi.fn>) => mock as unknown as typeof fetch;

describe("fetchLimitless", () => {
  beforeEach(() => {
    vi.stubEnv("LIMITLESS_API_KEY", KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sends the key in a header and never in the URL", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok([1]));
    const body = await fetchLimitless<number[]>("/tournaments", { limit: 5, game: "POCKET" }, {
      fetchImpl: asFetch(fetchImpl),
    });

    expect(body).toEqual([1]);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://play.limitlesstcg.com/api/tournaments?limit=5&game=POCKET");
    expect(String(url)).not.toContain(KEY);
    expect(init.headers).toEqual({ "X-Access-Key": KEY });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("omits the query string when there is none", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({}));
    await fetchLimitless("/tournaments/abc/pairings", {}, { fetchImpl: asFetch(fetchImpl) });
    expect(fetchImpl.mock.calls[0][0]).toBe("https://play.limitlesstcg.com/api/tournaments/abc/pairings");
  });

  it("retries a 503 with exponential backoff and then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(fail(503))
      .mockResolvedValueOnce(fail(502))
      .mockResolvedValueOnce(ok("done"));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const body = await fetchLimitless("/x", {}, { fetchImpl: asFetch(fetchImpl), sleep });

    expect(body).toBe("done");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((call) => call[0])).toEqual([BASE_DELAY_MS, BASE_DELAY_MS * 2]);
  });

  it("waits for the Retry-After header on a 429", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(fail(429, { "retry-after": "3" }))
      .mockResolvedValueOnce(ok("done"));
    const sleep = vi.fn().mockResolvedValue(undefined);

    await fetchLimitless("/x", {}, { fetchImpl: asFetch(fetchImpl), sleep });

    expect(sleep.mock.calls[0][0]).toBe(3000);
  });

  it("retries a network failure", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(ok("done"));
    const sleep = vi.fn().mockResolvedValue(undefined);

    expect(await fetchLimitless("/x", {}, { fetchImpl: asFetch(fetchImpl), sleep })).toBe("done");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not retry a client error", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fail(404));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const failure = await fetchLimitless<never>("/x", {}, { fetchImpl: asFetch(fetchImpl), sleep }).catch(
      (error: LimitlessError) => error
    );

    expect(failure).toBeInstanceOf(LimitlessError);
    expect(failure.status).toBe(404);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("gives up after the maximum attempts without leaking the key", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fail(500));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const failure = await fetchLimitless<never>("/x", {}, { fetchImpl: asFetch(fetchImpl), sleep }).catch(
      (error: LimitlessError) => error
    );

    expect(fetchImpl).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    expect(sleep).toHaveBeenCalledTimes(MAX_ATTEMPTS - 1);
    expect(failure.message).toBe(`Limitless /x failed after ${MAX_ATTEMPTS} attempts: 500 Failure`);
    expect(failure.message).not.toContain(KEY);
    expect(failure.status).toBe(500);
  });

  it("fails fast when the key is not set", async () => {
    vi.stubEnv("LIMITLESS_API_KEY", "");
    const fetchImpl = vi.fn();
    await expect(fetchLimitless("/x", {}, { fetchImpl: asFetch(fetchImpl) })).rejects.toThrow(
      "LIMITLESS_API_KEY not set"
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("mapWithConcurrency", () => {
  it("returns results in input order and never exceeds the limit", async () => {
    let active = 0;
    let peak = 0;
    const result = await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return value * 2;
    });

    expect(result).toEqual([2, 4, 6, 8, 10, 12]);
    expect(peak).toBe(2);
  });

  it("stops starting new work after a failure and rejects with the first error", async () => {
    const started: number[] = [];
    const run = mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
      started.push(value);
      if (value === 3) throw new Error("boom 3");
      await new Promise((resolve) => setTimeout(resolve, 5));
      return value;
    });

    await expect(run).rejects.toThrow("boom 3");
    expect(started).toEqual([1, 2, 3]);
  });

  it("handles an empty list", async () => {
    expect(await mapWithConcurrency([], 3, async (value: number) => value)).toEqual([]);
  });
});
