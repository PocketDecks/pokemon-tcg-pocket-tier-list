import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReactNode } from "react";
import useCards, { parseCardScores } from "../use-cards";
import committedScores from "../../../public/data/card-scores.json";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

let queryClient: QueryClient;

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

const renderCards = () =>
  renderHook(() => useCards(30), {
    wrapper,
  });

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: 3, retryDelay: () => 0 },
    },
  });
});

afterEach(() => {
  queryClient.clear();
  vi.unstubAllGlobals();
});

describe("useCards score failures", () => {
  it("keeps cached rows after a successful load and a 503 background refetch", async () => {
    let failing = false;
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse(failing ? [] : committedScores, failing ? 503 : 200))));
    const { result } = renderCards();
    await waitFor(() => expect(result.current.cards?.length).toBeGreaterThan(0));
    const rows = result.current.cards;
    failing = true;
    await act(async () => { await queryClient.refetchQueries({ queryKey: ["card-scores"] }); });
    await waitFor(() => expect(result.current.error?.message).toContain("503"));
    expect(result.current.cards).toEqual(rows);
  });

  it("reports an error for an HTTP 503 empty array instead of valid empty", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse([], 503)));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderCards();

    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });
    expect(result.current.cards).toBeNull();
    expect(result.current.error?.message).toContain("503");
  });

  it("reports an error after a rejected fetch exhausts retries", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderCards();

    await waitFor(() => {
      expect(result.current.error?.message).toBe("network down");
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(result.current.cards).toBeNull();
  });

  it("reports an error for a non-array payload instead of crashing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({}, 200)))
    );

    const { result } = renderCards();

    await waitFor(() => {
      expect(result.current.error?.message).toBe(
        "Card score payload is not an array"
      );
    });
    expect(result.current.cards).toBeNull();
  });

  it("reports an error for a malformed nested row", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          jsonResponse([
            { name: "1 Copycat B1 225", score: 0.8, popularity: 0.9 },
            { name: "2 Broken PA 9", score: "high", popularity: 0.5 },
          ])
        )
      )
    );

    const { result } = renderCards();

    await waitFor(() => {
      expect(result.current.error?.message).toBe(
        "Card score payload contains an invalid row"
      );
    });
    expect(result.current.cards).toBeNull();
  });

  it("keeps an HTTP 200 empty array as a valid empty result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(jsonResponse([], 200))));

    const { result } = renderCards();

    await waitFor(() => {
      expect(result.current.cards).not.toBeNull();
    });
    expect(result.current.cards).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("ranks committed score rows without an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(committedScores, 200)))
    );

    const { result } = renderCards();

    await waitFor(() => {
      expect(result.current.cards).not.toBeNull();
    });
    const cards = result.current.cards ?? [];
    expect(cards.length).toBeGreaterThan(0);
    expect(result.current.error).toBeNull();
    for (let index = 1; index < cards.length; index += 1) {
      expect(cards[index - 1].score).toBeGreaterThanOrEqual(cards[index].score);
    }
  });

  it("restores rankings when retry follows a failed load", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([], 503))
      .mockResolvedValueOnce(jsonResponse([], 503))
      .mockResolvedValueOnce(jsonResponse([], 503))
      .mockResolvedValueOnce(jsonResponse([], 503))
      .mockImplementation(() => Promise.resolve(jsonResponse(committedScores, 200)));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderCards();

    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });

    await act(async () => {
      result.current.retry();
    });

    await waitFor(() => {
      expect(result.current.error).toBeNull();
      expect(result.current.cards?.length ?? 0).toBeGreaterThan(0);
    });
  });

  it.each([

    ["a negative score", [{ name: "1 Copycat B1 225", score: -0.5, popularity: 0.9 }]],
    ["a trailing count", [{ name: "2x Copycat B1 225", score: 0.8, popularity: 0.9 }]],
    ["a negative count", [{ name: "-1 Copycat B1 225", score: 0.8, popularity: 0.9 }]],
    ["a non-numeric card number", [{ name: "2 b4a abc", score: 0.8, popularity: 0.9 }]],
  ])("rejects %s", async (_label, rows) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(rows, 200)))
    );

    const { result } = renderCards();

    await waitFor(() => {
      expect(result.current.error?.message).toBe(
        "Card score payload contains an invalid row"
      );
    });
    expect(result.current.cards).toBeNull();
  });

  it("accepts every committed score row", () => {
    expect(parseCardScores(committedScores)).toHaveLength(committedScores.length);
  });
});
