import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getCurrentUserSubscriptions } from "@invertase/firestore-stripe-payments";
import useIsPremium from "../use-is-premium";
import { useAuth } from "../../contexts/AuthContext";
import { queryClientOptions } from "../../App";

const firestore = vi.hoisted(() => ({
  getDoc: vi.fn(),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join("/") })),
  getFirestore: vi.fn(() => ({ kind: "db" })),
}));

vi.mock("firebase/firestore", () => firestore);

vi.mock("@invertase/firestore-stripe-payments", () => ({
  getStripePayments: vi.fn(),
  getCurrentUserSubscriptions: vi.fn(),
}));

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../../config/firebase", () => ({
  default: { name: "app" },
  getPayments: vi.fn().mockResolvedValue({}),
}));

const mockSubscriptions = getCurrentUserSubscriptions as ReturnType<typeof vi.fn>;
const mockAuth = useAuth as ReturnType<typeof vi.fn>;

const DAY = 24 * 60 * 60 * 1000;

const entitlement = (data: Record<string, unknown> | null) => ({
  exists: () => data !== null,
  data: () => data,
});

const timestamp = (millis: number) => ({ toMillis: () => millis });

const Probe = () => {
  const isPremium = useIsPremium();
  return <p>{isPremium === null ? "pending" : String(isPremium)}</p>;
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
  mockSubscriptions.mockResolvedValue([]);
  firestore.getDoc.mockResolvedValue(entitlement(null));
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

describe("entitlement document", () => {
  it("reads the signed-in user's own entitlement document", async () => {
    renderProbe();
    await screen.findByText("false");
    expect(firestore.doc).toHaveBeenCalledWith(expect.anything(), "entitlements", "u1");
  });

  it("grants premium without any Stripe subscription", async () => {
    firestore.getDoc.mockResolvedValue(
      entitlement({ premium: true, source: "manual", updatedAt: timestamp(1) })
    );
    renderProbe();
    await screen.findByText("true");
  });

  it("grants premium while the expiry is in the future", async () => {
    firestore.getDoc.mockResolvedValue(
      entitlement({ premium: true, source: "manual", expiresAt: timestamp(Date.now() + DAY) })
    );
    renderProbe();
    await screen.findByText("true");
  });

  it("does not grant premium once the expiry has passed", async () => {
    firestore.getDoc.mockResolvedValue(
      entitlement({ premium: true, source: "manual", expiresAt: timestamp(Date.now() - DAY) })
    );
    renderProbe();
    await screen.findByText("false");
    expect(firestore.getDoc).toHaveBeenCalled();
  });

  it("does not grant premium when the flag is false", async () => {
    firestore.getDoc.mockResolvedValue(entitlement({ premium: false, source: "refund" }));
    renderProbe();
    await screen.findByText("false");
    expect(firestore.getDoc).toHaveBeenCalled();
  });

  it("does not grant premium when the flag is not the boolean true", async () => {
    firestore.getDoc.mockResolvedValue(entitlement({ premium: "yes", source: "manual" }));
    renderProbe();
    await screen.findByText("false");
    expect(firestore.getDoc).toHaveBeenCalled();
  });

  it("stays unknown until the entitlement lookup settles", async () => {
    firestore.getDoc.mockReturnValue(new Promise(() => {}));
    renderProbe();
    await vi.waitFor(() => expect(firestore.getDoc).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByText("pending")).toBeInTheDocument();
  });

  it("grants as soon as the entitlement does, even while Stripe is still pending", async () => {
    mockSubscriptions.mockReturnValue(new Promise(() => {}));
    firestore.getDoc.mockResolvedValue(entitlement({ premium: true, source: "manual" }));
    renderProbe();
    await screen.findByText("true");
  });
});

describe("independence of the two sources", () => {
  it("keeps a Stripe grant when the entitlement read is denied", async () => {
    mockSubscriptions.mockResolvedValue([{ status: "active" }]);
    firestore.getDoc.mockRejectedValue(
      Object.assign(new Error("denied"), { code: "permission-denied" })
    );
    renderProbe();
    await screen.findByText("true");
  });

  it("keeps an entitlement grant when the Stripe lookup fails", async () => {
    mockSubscriptions.mockRejectedValue(new Error("offline"));
    firestore.getDoc.mockResolvedValue(entitlement({ premium: true, source: "manual" }));
    renderProbe();
    await screen.findByText("true");
  });

  it("resolves to false when both sources fail", async () => {
    mockSubscriptions.mockRejectedValue(new Error("offline"));
    firestore.getDoc.mockRejectedValue(new Error("offline"));
    renderProbe();
    await screen.findByText("false");
    expect(firestore.getDoc).toHaveBeenCalled();
  });

  it("resolves to false when one source fails and the other holds no grant", async () => {
    mockSubscriptions.mockResolvedValue([]);
    firestore.getDoc.mockRejectedValue(new Error("offline"));
    renderProbe();
    await screen.findByText("false");
    expect(firestore.getDoc).toHaveBeenCalled();
  });
});

describe("deduplication", () => {
  it("issues one entitlement read for two consumers", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <Probe />
        <Probe />
      </QueryClientProvider>
    );
    await screen.findAllByText("false");
    expect(firestore.getDoc).toHaveBeenCalledTimes(1);
  });
});

describe("signed-out and loading states", () => {
  it("returns false for a signed-out user without reading Firestore", async () => {
    mockAuth.mockReturnValue({ user: null, loading: false });
    renderProbe();
    await screen.findByText("false");
    expect(firestore.getDoc).not.toHaveBeenCalled();
  });

  it("returns null while auth is loading without reading Firestore", () => {
    mockAuth.mockReturnValue({ user: null, loading: true });
    renderProbe();
    expect(screen.getByText("pending")).toBeInTheDocument();
    expect(firestore.getDoc).not.toHaveBeenCalled();
  });
});
