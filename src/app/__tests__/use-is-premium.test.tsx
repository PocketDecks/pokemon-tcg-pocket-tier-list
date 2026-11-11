import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
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
  it("serves cached access within 30 seconds and reads a changed entitlement afterwards", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(10_000);
    firestore.getDoc
      .mockResolvedValueOnce(snapshot(null))
      .mockResolvedValue(snapshot({ premium: true, expiresAt: timestamp(10_000 + DAY) }));
    const first = renderProbe();
    await screen.findByText("false:none");
    expect(firestore.getDoc).toHaveBeenCalledTimes(1);

    first.unmount();
    clock.mockReturnValue(10_000 + 20_000);
    renderProbe();
    await waitFor(() => expect(queryClient.getQueryState(["entitlement", "u1"])?.fetchStatus).toBe("idle"));
    expect(screen.getByText("false:none")).toBeInTheDocument();
    expect(firestore.getDoc).toHaveBeenCalledTimes(1);

    clock.mockReturnValue(10_000 + 30_001);
    const changedConsumer = renderProbe();
    expect(await screen.findAllByText(`true:${10_000 + DAY}`)).toHaveLength(2);
    expect(firestore.getDoc).toHaveBeenCalledTimes(2);
    changedConsumer.unmount();
  });

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
  });

  it("denies an expired entitlement", async () => {
    const expiry = Date.now() - DAY;
    firestore.getDoc.mockResolvedValue(snapshot({ premium: true, expiresAt: timestamp(expiry) }));
    renderProbe();
    await screen.findByText(`false:${expiry}`);
  });

  it("revokes access while mounted when the entitlement expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    const expiry = Date.now() + 500;
    firestore.getDoc.mockResolvedValue(snapshot({ premium: true, expiresAt: timestamp(expiry) }));
    queryClient.setQueryData(["entitlement", "u1"], { premium: true, expiresAt: expiry });
    renderProbe();
    expect(screen.getByText(`true:${expiry}`)).toBeInTheDocument();

    await act(async () => vi.advanceTimersByTimeAsync(expiry - Date.now()));

    expect(screen.getByText(`false:${expiry}`)).toBeInTheDocument();
    expect(firestore.getDoc).not.toHaveBeenCalled();
  });

  it("revokes access through the final expiry chunk beyond the maximum timeout delay", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    const maxTimeout = 2_147_483_647;
    const expiry = Date.now() + maxTimeout + 5_000;
    queryClient.setQueryData(["entitlement", "u1"], { premium: true, expiresAt: expiry });
    renderProbe();
    expect(screen.getByText(`true:${expiry}`)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(maxTimeout);
    });
    expect(screen.getByText(`true:${expiry}`)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(screen.getByText(`false:${expiry}`)).toBeInTheDocument();
    expect(firestore.getDoc).not.toHaveBeenCalled();
  });

  it("clears the expiry timer when a consumer unmounts", () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    queryClient.setDefaultOptions({
      ...queryClient.getDefaultOptions(),
      queries: { ...queryClient.getDefaultOptions().queries, gcTime: Infinity },
    });
    const expiry = Date.now() + 60_000;
    queryClient.setQueryData(["entitlement", "u1"], { premium: true, expiresAt: expiry });
    const timerCount = vi.getTimerCount();
    const view = renderProbe();
    expect(screen.getByText(`true:${expiry}`)).toBeInTheDocument();
    expect(vi.getTimerCount()).toBeGreaterThan(timerCount);
    view.unmount();
    expect(vi.getTimerCount()).toBe(timerCount);
  });

  it("keeps valid cached access when a background entitlement refetch fails", async () => {
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
    expect(screen.getByText(`true:${expiry}`)).toBeInTheDocument();
  });

  it("fails closed when the first entitlement read errors", async () => {
    firestore.getDoc.mockRejectedValue(new Error("offline"));
    renderProbe();
    await screen.findByText("false:none");
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
