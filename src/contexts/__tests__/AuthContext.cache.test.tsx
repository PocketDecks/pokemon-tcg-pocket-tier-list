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
import { dataVersionKey, decksKey, entitlementKey, matchupsKey, metaShareKey } from "../../app/query-keys";

let client: QueryClient;
const loads = vi.fn(async (uid: string) => `premium data for ${uid}`);

const Probe = () => {
  const { user } = useAuth();
  const premium = useQuery({
    queryKey: decksKey("30d"),
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
    client.setQueryData(decksKey("20d"), "public data");
    client.setQueryData(decksKey("all"), "supporter decks all");
    client.setQueryData(matchupsKey("all"), "supporter matchups all");
    client.setQueryData(metaShareKey("20d", "full"), "full meta share");
    client.setQueryData(entitlementKey("user-a"), { premium: true });
    render(tree());

    act(() => authState.callback?.({ uid: "user-a" }));
    await waitFor(() => expect(screen.getByTestId("premium")).toHaveTextContent("premium data for user-a"));
    expect(loads).toHaveBeenCalledTimes(1);

    act(() => authState.callback?.(null));
    await waitFor(() => expect(client.getQueryData(decksKey("30d"))).toBeUndefined());
    expect(keys()).toContainEqual(decksKey("20d"));
    expect(keys()).not.toContainEqual(decksKey("all"));
    expect(keys()).not.toContainEqual(matchupsKey("all"));
    expect(keys()).not.toContainEqual(metaShareKey("20d", "full"));
    expect(keys()).not.toContainEqual(entitlementKey("user-a"));

    act(() => authState.callback?.({ uid: "user-b" }));
    await waitFor(() => expect(screen.getByTestId("premium")).toHaveTextContent("premium data for user-b"));
    expect(loads).toHaveBeenCalledTimes(2);
    expect(client.getQueryData(decksKey("20d"))).toBe("public data");
  });

  it("purges cached Supporter matchups on sign-out and keeps the public 20-day matchups", async () => {
    render(tree());

    act(() => authState.callback?.({ uid: "user-a" }));
    await waitFor(() => expect(screen.getByTestId("premium")).toHaveTextContent("premium data for user-a"));

    client.setQueryData(matchupsKey("30d"), "supporter matchups 30d");
    client.setQueryData(matchupsKey("all"), "supporter matchups all");
    client.setQueryData(matchupsKey("20d"), "public matchups 20d");
    client.setQueryData(metaShareKey("30d", "full"), "supporter meta share 30d");
    client.setQueryData(metaShareKey("20d", "public"), "public meta share 20d");
    client.setQueryData(dataVersionKey, "abcdef0123456789");
    expect(keys()).toContainEqual(matchupsKey("30d"));
    expect(keys()).toContainEqual(matchupsKey("all"));

    act(() => authState.callback?.(null));
    await waitFor(() => expect(keys()).not.toContainEqual(matchupsKey("30d")));
    expect(keys()).not.toContainEqual(matchupsKey("all"));
    expect(keys()).not.toContainEqual(metaShareKey("30d", "full"));
    expect(keys()).toContainEqual(matchupsKey("20d"));
    expect(client.getQueryData(matchupsKey("20d"))).toBe("public matchups 20d");
    expect(client.getQueryData(metaShareKey("20d", "public"))).toBe("public meta share 20d");
    expect(client.getQueryData(dataVersionKey)).toBe("abcdef0123456789");
  });

  it("purges a Supporter query added later without any change to the auth code", async () => {
    render(tree());
    act(() => authState.callback?.({ uid: "user-a" }));
    client.setQueryData(["supporter", "some-new-feature", "user-a"], "private");
    client.setQueryData(["some-new-feature", "public"], "public");

    act(() => authState.callback?.({ uid: "user-b" }));

    await waitFor(() => expect(keys()).not.toContainEqual(["supporter", "some-new-feature", "user-a"]));
    expect(keys()).toContainEqual(["some-new-feature", "public"]);
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
