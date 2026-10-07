import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  getCurrentUserSubscriptions,
} from "@invertase/firestore-stripe-payments";
import useIsPremium from "../use-is-premium";
import { useAuth } from "../../contexts/AuthContext";
import { queryClientOptions } from "../../App";

vi.mock("@invertase/firestore-stripe-payments", () => ({
  getStripePayments: vi.fn(),
  getCurrentUserSubscriptions: vi.fn(),
}));

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../../config/firebase", () => ({
  getPayments: vi.fn().mockResolvedValue({}),
}));

const mockSubscriptions = getCurrentUserSubscriptions as ReturnType<typeof vi.fn>;
const mockAuth = useAuth as ReturnType<typeof vi.fn>;

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
});

afterEach(() => {
  queryClient.clear();
  vi.clearAllMocks();
});

const renderProbe = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <Probe />
    </QueryClientProvider>
  );

describe("useIsPremium contract", () => {
  it("returns null while auth is loading", async () => {
    mockAuth.mockReturnValue({ user: null, loading: true });
    renderProbe();
    expect(screen.getByText("pending")).toBeInTheDocument();
    expect(mockSubscriptions).not.toHaveBeenCalled();
  });

  it("returns false for a signed-out user without querying subscriptions", async () => {
    mockAuth.mockReturnValue({ user: null, loading: false });
    renderProbe();
    await screen.findByText("false");
    expect(mockSubscriptions).not.toHaveBeenCalled();
  });

  it("returns true when a subscription exists", async () => {
    mockSubscriptions.mockResolvedValue([{ status: "active" }]);
    mockAuth.mockReturnValue({ user: { uid: "u1" }, loading: false });
    renderProbe();
    await screen.findByText("true");
  });

  it("returns false when no subscription exists", async () => {
    mockSubscriptions.mockResolvedValue([]);
    mockAuth.mockReturnValue({ user: { uid: "u1" }, loading: false });
    renderProbe();
    await screen.findByText("false");
  });

  it("returns false when the lookup rejects", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockSubscriptions.mockRejectedValue(new Error("offline"));
    mockAuth.mockReturnValue({ user: { uid: "u1" }, loading: false });
    renderProbe();
    await screen.findByText("false");
    expect(spy).toHaveBeenCalled();
  });
});

describe("deduplication across hook instances", () => {
  it("issues one subscription lookup for two consumers", async () => {
    // Defines the work: the per-instance implementation queries once each.
    mockSubscriptions.mockResolvedValue([]);
    mockAuth.mockReturnValue({ user: { uid: "u1" }, loading: false });
    render(
      <QueryClientProvider client={queryClient}>
        <Probe />
        <Probe />
      </QueryClientProvider>
    );
    await screen.findAllByText("false");
    expect(mockSubscriptions).toHaveBeenCalledTimes(1);
  });
});

describe("recovery after a transient failure", () => {
  it("reports premium again once a refetch succeeds", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockAuth.mockReturnValue({ user: { uid: "u1" }, loading: false });
    mockSubscriptions.mockRejectedValueOnce(new Error("transient"));

    renderProbe();
    await screen.findByText("false");

    mockSubscriptions.mockResolvedValue([{ status: "active" }]);
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ["premium", "u1"] });
    });

    await screen.findByText("true");
  });
});
