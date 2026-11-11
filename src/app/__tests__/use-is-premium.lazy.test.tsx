import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import useIsPremium from "../use-is-premium";
import { useAuth } from "../../contexts/AuthContext";

const loaded = vi.hoisted(() => ({ firestore: false }));

vi.mock("firebase/firestore", () => {
  loaded.firestore = true;
  return {
    doc: vi.fn(),
    getDoc: vi.fn().mockResolvedValue({ exists: () => false }),
    getFirestore: vi.fn(),
  };
});

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../../config/firebase", () => ({
  __esModule: true,
  default: { name: "app" },
}));

const Probe = () => {
  const isPremium = useIsPremium();
  return <p>{isPremium === null ? "pending" : String(isPremium)}</p>;
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("Firestore code loading", () => {
  it("does not load Firestore for a signed-out visitor", async () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: null, loading: false });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Probe />
      </QueryClientProvider>
    );
    await screen.findByText("false");
    expect(loaded.firestore).toBe(false);
  });

  it("loads Firestore only once a user is signed in", async () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: { uid: "u1" }, loading: false });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Probe />
      </QueryClientProvider>
    );
    await screen.findByText("false");
    expect(loaded.firestore).toBe(true);
  });
});
