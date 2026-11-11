import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  callback: null as ((user: { uid: string } | null) => void) | null,
}));

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: vi.fn((_auth, callback) => {
    authState.callback = callback;
    callback(null);
    return vi.fn();
  }),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("../../config/firebase", () => ({ auth: {}, googleProvider: {} }));

import { AuthProvider, useAuth } from "../AuthContext";

let client: QueryClient;
const loads = vi.fn(async (uid: string) => `premium data for ${uid}`);

const Probe = () => {
  const { user } = useAuth();
  const premium = useQuery({
    queryKey: ["decks", "30d", user ? "full" : "public"],
    queryFn: () => loads(user!.uid),
    enabled: !!user,
    retry: false,
  });
  return <output data-testid="premium">{premium.data ?? "empty"}</output>;
};

const tree = () => (
  <QueryClientProvider client={client}>
    <AuthProvider><Probe /></AuthProvider>
  </QueryClientProvider>
);

const keys = () => client.getQueryCache().getAll().map(({ queryKey }) => queryKey);

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  loads.mockClear();
});

afterEach(() => {
  client.clear();
  vi.clearAllMocks();
});

describe("auth cache isolation", () => {
  it("purges premium data synchronously on sign-out and fetches it again on sign-in", async () => {
    client.setQueryData(["decks", "20d", "public"], "public data");
    client.setQueryData(["decks", "all"], "legacy premium data");
    client.setQueryData(["matchups", "20d", "full"], "full matchups");
    client.setQueryData(["meta-share", "20d", "full"], "full meta share");
    client.setQueryData(["entitlement", "user-a"], { premium: true });
    render(tree());

    act(() => authState.callback?.({ uid: "user-a" }));
    await waitFor(() => expect(screen.getByTestId("premium")).toHaveTextContent("premium data for user-a"));
    expect(loads).toHaveBeenCalledTimes(1);

    act(() => authState.callback?.(null));
    await waitFor(() => expect(keys()).not.toContainEqual(["decks", "30d", "full"]));
    expect(keys()).toContainEqual(["decks", "20d", "public"]);
    expect(keys()).not.toContainEqual(["decks", "all"]);
    expect(keys()).not.toContainEqual(["matchups", "20d", "full"]);
    expect(keys()).not.toContainEqual(["meta-share", "20d", "full"]);
    expect(keys()).not.toContainEqual(["entitlement", "user-a"]);

    act(() => authState.callback?.({ uid: "user-b" }));
    await waitFor(() => expect(screen.getByTestId("premium")).toHaveTextContent("premium data for user-b"));
    expect(loads).toHaveBeenCalledTimes(2);
    expect(client.getQueryData(["decks", "20d", "public"])).toBe("public data");
  });

  it("does not restore an old account's in-flight premium result after an account switch", async () => {
    let resolveOld!: (value: string) => void;
    let resolveNew!: (value: string) => void;
    const oldResult = new Promise<string>((resolve) => { resolveOld = resolve; });
    const newResult = new Promise<string>((resolve) => { resolveNew = resolve; });
    loads.mockImplementation((uid) => uid === "user-a" ? oldResult : newResult);
    render(tree());

    act(() => authState.callback?.({ uid: "user-a" }));
    await waitFor(() => expect(loads).toHaveBeenCalledWith("user-a"));
    act(() => authState.callback?.({ uid: "user-b" }));
    await waitFor(() => expect(loads).toHaveBeenCalledWith("user-b"));

    await act(async () => resolveOld("premium data for user-a"));
    expect(screen.getByTestId("premium")).toHaveTextContent("empty");
    await act(async () => resolveNew("premium data for user-b"));
    await waitFor(() => expect(screen.getByTestId("premium")).toHaveTextContent("premium data for user-b"));
  });
});
