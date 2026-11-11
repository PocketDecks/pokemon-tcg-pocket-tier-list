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

const Probe = () => {
  const isPremium = useIsPremium();
  const expiry = usePremiumExpiry();
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
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    const maxTimeout = 2_147_483_647;
    const expiry = Date.now() + maxTimeout + 5_000;
    firestore.getDoc.mockResolvedValue(snapshot({ premium: true, expiresAt: timestamp(expiry) }));
    const view = renderProbe();
    await screen.findByText(`true:${expiry}`);
    const timerIndex = setTimeoutSpy.mock.calls.findIndex(([, delay]) => delay === maxTimeout);
    expect(timerIndex).not.toBe(-1);
    const expiryTimer = setTimeoutSpy.mock.results[timerIndex].value;

    view.unmount();

    expect(clearTimeoutSpy).toHaveBeenCalledWith(expiryTimer);
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
