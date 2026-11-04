import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import useCards from "../use-cards";
import { MissingContext } from "../../components/MissingContext";

const cards = [
  { id: "b4a-001", name: "Volbeat", set: "b4a", pack: "Booster", rarity: "Common", image: "/cards/b4a-001.webp" },
];

const scores = [{ name: "2 b4a 001", score: 0.8, popularity: 0.5, count: 2 }];

const wrapperWith = (marks: string[], rows: typeof scores = scores) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  queryClient.setQueryData(["cards"], { cards });
  queryClient.setQueryData(["card-scores"], rows);
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MissingContext.Provider
        value={{ missing: marks, addMissing: () => {}, canUndo: false, undoMissing: () => {}, lastRemovedId: null }}
      >
        {children}
      </MissingContext.Provider>
    </QueryClientProvider>
  );
};

describe("useCards with cards marked by a visitor", () => {
  it("takes one marked copy off the visitor's count by default", () => {
    const { result } = renderHook(() => useCards(30), { wrapper: wrapperWith(["b4a-001"]) });

    expect(result.current?.[0].count).toBe(1);
  });

  it("drops a card every copy of which the visitor has marked, by default", () => {
    const { result } = renderHook(() => useCards(30), { wrapper: wrapperWith(["b4a-001", "b4a-001"]) });

    expect(result.current).toEqual([]);
  });

  it("keeps every copy and every card when the marks are ignored", () => {
    const { result } = renderHook(() => useCards(30, { ignoreCollection: true }), {
      wrapper: wrapperWith(["b4a-001", "b4a-001"]),
    });

    expect(result.current?.map((card) => card.id)).toEqual(["b4a-001"]);
    expect(result.current?.[0].count).toBe(2);
  });

  it("keeps a zero-copy score row when the marks are ignored, and drops it by default", () => {
    const zeroCopy = [{ name: "0 b4a 001", score: 0.8, popularity: 0.5, count: 0 }];
    const ignored = renderHook(() => useCards(30, { ignoreCollection: true }), {
      wrapper: wrapperWith([], zeroCopy),
    });
    const defaults = renderHook(() => useCards(30), { wrapper: wrapperWith([], zeroCopy) });

    expect(ignored.result.current?.map((card) => card.id)).toEqual(["b4a-001"]);
    expect(defaults.result.current).toEqual([]);
  });
});
