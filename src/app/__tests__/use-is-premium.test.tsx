import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import useIsPremium, { usePremiumExpiry } from "../use-is-premium";
import { useAuth } from "../../contexts/AuthContext";
import { queryClientOptions } from "../../App";

const firestore = vi.hoisted(() => ({
  getDoc: vi.fn(),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join("/") })),
  getFirestore: vi.fn(() => ({ kind: "db" })),
}));

vi.mock("firebase/firestore", () => firestore);
vi.mock("../../contexts/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("../../config/firebase", () => ({ default: { name: "app" } }));

const mockAuth = useAuth as ReturnType<typeof vi.fn>;
const DAY = 24 * 60 * 60 * 1000;
const snapshot = (data: Record<string, unknown> | null) => ({
  exists: () => data !== null,
  data: () => data,
});
const timestamp = (millis: number) => ({ toMillis: () => millis });

const Probe = ({ observe }: { observe?: (value: boolean | null) => void }) => {
  const isPremium = useIsPremium();
  const expiry = usePremiumExpiry();
  observe?.(isPremium);
  return <p>{`${isPremium === null ? "pending" : isPremium}:${expiry ?? "none"}`}</p>;
};

let queryClient: QueryClient;

beforeEach(() => {
  queryClient = new QueryClient({
    ...queryClientOptions,
    defaultOptions: {
      queries: { ...queryClientOptions.defaultOptions.queries, retry: false },
    },
  });
  mockAuth.mockReturnValue({ user: { uid: "u1" }, loading: false });
  firestore.getDoc.mockResolvedValue(snapshot(null));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  queryClient.clear();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const renderProbe = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <Probe />
    </QueryClientProvider>
  );

describe("entitlement access", () => {
  it("keeps the null loading contract", () => {
    mockAuth.mockReturnValue({ user: null, loading: true });
    renderProbe();
    expect(screen.getByText("pending:none")).toBeInTheDocument();
    expect(firestore.getDoc).not.toHaveBeenCalled();
  });

  it("denies a missing entitlement without reading customers", async () => {
    renderProbe();
    await screen.findByText("false:none");
    expect(firestore.doc).toHaveBeenCalledWith(expect.anything(), "entitlements", "u1");
    expect(firestore.doc.mock.calls.some(([, ...path]) => path[0] === "customers")).toBe(false);
  });

  it("denies an entitlement with premium false", async () => {
    firestore.getDoc.mockResolvedValue(snapshot({ premium: false }));
    renderProbe();
    await screen.findByText("false:none");
  });

  it("grants a future entitlement and exposes its expiry from the same read", async () => {
    const expiry = Date.now() + DAY;
    firestore.getDoc.mockResolvedValue(snapshot({ premium: true, expiresAt: timestamp(expiry) }));
    renderProbe();
    await screen.findByText(`true:${expiry}`);
    expect(firestore.getDoc).toHaveBeenCalledTimes(1);
  });

  it("denies an expired entitlement", async () => {
    const expiry = Date.now() - DAY;
    firestore.getDoc.mockResolvedValue(snapshot({ premium: true, expiresAt: timestamp(expiry) }));
    renderProbe();
    await screen.findByText(`false:${expiry}`);
  });

  it("revokes access while mounted when the entitlement expires", async () => {
    const expiry = Date.now() + 500;
    firestore.getDoc.mockResolvedValue(snapshot({ premium: true, expiresAt: timestamp(expiry) }));
    renderProbe();
    await screen.findByText(`true:${expiry}`);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, expiry - Date.now() + 20)));
    });

    await screen.findByText(`false:${expiry}`);
    expect(firestore.getDoc).toHaveBeenCalledTimes(1);
  });

  it("chunks expiry timers beyond the maximum timeout delay", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    const maxTimeout = 2_147_483_647;
    const expiry = Date.now() + maxTimeout + 5_000;
    queryClient.setQueryData(["entitlement", "u1"], { premium: true, expiresAt: expiry });
    const view = renderProbe();
    expect(screen.getByText(`true:${expiry}`)).toBeInTheDocument();
    const timerIndex = setTimeoutSpy.mock.calls.findIndex(([, delay]) => delay === maxTimeout);
    expect(timerIndex).not.toBe(-1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(maxTimeout);
    });
    const remainderIndex = setTimeoutSpy.mock.calls.findIndex(
      ([, delay], index) => index > timerIndex && delay === 5_000
    );
    expect(remainderIndex).not.toBe(-1);
    expect(screen.getByText(`true:${expiry}`)).toBeInTheDocument();
    const remainderTimer = setTimeoutSpy.mock.results[remainderIndex].value;

    view.unmount();

    expect(clearTimeoutSpy).toHaveBeenCalledWith(remainderTimer);
    expect(firestore.getDoc).not.toHaveBeenCalled();
  });

  it("denies cached access when a background entitlement refetch fails", async () => {
    const expiry = Date.now() + DAY;
    firestore.getDoc.mockResolvedValue(snapshot({ premium: true, expiresAt: timestamp(expiry) }));
    renderProbe();
    await screen.findByText(`true:${expiry}`);
    firestore.getDoc.mockRejectedValueOnce(new Error("offline"));

    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ["entitlement", "u1"] });
    });

    expect(firestore.getDoc).toHaveBeenCalledTimes(2);
    expect(queryClient.getQueryState(["entitlement", "u1"])?.error).toBeInstanceOf(Error);
    await screen.findByText(`false:${expiry}`);
  });

  it("does not briefly grant a refetched entitlement that is already expired", async () => {
    const mountedAt = 10_000;
    vi.spyOn(Date, "now").mockReturnValue(mountedAt);
    firestore.getDoc.mockResolvedValue(
      snapshot({ premium: true, expiresAt: timestamp(mountedAt + DAY) })
    );
    const observed: Array<boolean | null> = [];
    render(
      <QueryClientProvider client={queryClient}>
        <Probe observe={(value) => observed.push(value)} />
      </QueryClientProvider>
    );
    await screen.findByText(`true:${mountedAt + DAY}`);

    observed.length = 0;
    vi.mocked(Date.now).mockReturnValue(mountedAt + DAY + 1);
    const alreadyExpiredAt = mountedAt + DAY - 1;
    firestore.getDoc.mockResolvedValueOnce(
      snapshot({ premium: true, expiresAt: timestamp(alreadyExpiredAt) })
    );
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ["entitlement", "u1"] });
    });

    await screen.findByText(`false:${alreadyExpiredAt}`);
    expect(observed).not.toContain(true);
  });

  it.each([undefined, null])("grants a lifetime entitlement with expiry %s", async (expiresAt) => {
    firestore.getDoc.mockResolvedValue(snapshot({ premium: true, expiresAt }));
    renderProbe();
    await screen.findByText("true:none");
  });

  it.each([
    ["missing toMillis", {}],
    ["non-finite", { toMillis: () => Number.POSITIVE_INFINITY }],
    ["throwing", { toMillis: () => { throw new Error("invalid timestamp"); } }],
  ])("fails closed for %s expiry", async (_name, expiresAt) => {
    firestore.getDoc.mockResolvedValue(snapshot({ premium: true, expiresAt }));
    renderProbe();
    await screen.findByText("false:none");
  });
});
