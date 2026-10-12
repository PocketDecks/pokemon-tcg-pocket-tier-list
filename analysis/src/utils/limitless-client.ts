const BASE = "https://play.limitlesstcg.com/api";

export const MAX_ATTEMPTS = 4;
export const BASE_DELAY_MS = 500;
export const MAX_RETRY_AFTER_MS = 30_000;
export const REQUEST_TIMEOUT_MS = 20_000;

export const apiKey = (): string => {
  const key = process.env.LIMITLESS_API_KEY;
  if (!key) throw new Error("LIMITLESS_API_KEY not set");
  return key;
};

export class LimitlessError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "LimitlessError";
    this.status = status;
  }
}

export interface ClientDeps {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const withAuth = (
  path: string,
  query: Record<string, string | number>,
  key: string
): { url: string; headers: Record<string, string> } => {
  const search = new URLSearchParams(
    Object.entries(query).map(([name, value]): [string, string] => [name, String(value)])
  ).toString();
  return {
    url: `${BASE}${path}${search ? `?${search}` : ""}`,
    headers: { "X-Access-Key": key },
  };
};

const retryable = (status: number): boolean => status === 429 || status >= 500;

const retryDelay = (attempt: number, retryAfter: string | null): number => {
  const seconds = retryAfter === null ? Number.NaN : Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  }
  return BASE_DELAY_MS * 2 ** (attempt - 1);
};

export const fetchLimitless = async <T>(
  path: string,
  query: Record<string, string | number> = {},
  { fetchImpl = fetch, sleep = defaultSleep }: ClientDeps = {}
): Promise<T> => {
  const { url, headers } = withAuth(path, query, apiKey());
  let lastFailure = "no attempt made";
  let lastStatus: number | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let retryAfter: string | null = null;
    try {
      const res = await fetchImpl(url, {
        headers,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (res.ok) return (await res.json()) as T;
      lastStatus = res.status;
      lastFailure = `${res.status} ${res.statusText}`;
      if (!retryable(res.status)) {
        throw new LimitlessError(`Limitless ${path} failed: ${lastFailure}`, res.status);
      }
      retryAfter = res.headers?.get?.("retry-after") ?? null;
    } catch (error) {
      if (error instanceof LimitlessError) throw error;
      lastStatus = undefined;
      lastFailure = error instanceof Error ? error.name : "network error";
    }
    if (attempt < MAX_ATTEMPTS) await sleep(retryDelay(attempt, retryAfter));
  }

  throw new LimitlessError(
    `Limitless ${path} failed after ${MAX_ATTEMPTS} attempts: ${lastFailure}`,
    lastStatus
  );
};

export const mapWithConcurrency = async <T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T, index: number) => Promise<R>
): Promise<R[]> => {
  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;
  let failure: unknown;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (!failed) {
      const index = next++;
      if (index >= items.length) return;
      try {
        results[index] = await work(items[index], index);
      } catch (error) {
        if (!failed) {
          failed = true;
          failure = error;
        }
        return;
      }
    }
  });

  await Promise.all(runners);
  if (failed) throw failure;
  return results;
};
