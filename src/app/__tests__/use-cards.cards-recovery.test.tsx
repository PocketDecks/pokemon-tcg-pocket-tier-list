import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { fetchCards } from "../cards-api";
import useCards from "../use-cards";
import committedScores from "../../../public/data/card-scores.json";

vi.mock("../cards-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../cards-api")>();
  return { ...actual, fetchCards: vi.fn(actual.fetchCards) };
});

it("reports a cards.json failure and retries the cards query to restore rows", async () => {
  vi.mocked(fetchCards).mockRejectedValueOnce(new Error("cards.json request failed with status 503"));
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(committedScores))));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const hook = renderHook(() => useCards(), { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
  try {
    await waitFor(() => expect(hook.result.current.error?.message).toContain("cards.json"));
    expect(hook.result.current.cards).toBeNull();
    await act(async () => { await hook.result.current.retry(); });
    await waitFor(() => expect(hook.result.current.cards?.length).toBeGreaterThan(0));
    expect(hook.result.current.error).toBeNull();
    expect(fetchCards).toHaveBeenCalledTimes(2);
  } finally {
    hook.unmount();
    client.clear();
    vi.unstubAllGlobals();
  }
});
