import { vi } from "vitest";
import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { MetaWindowProvider } from "../../contexts/MetaWindowContext";
import { deckHref } from "../deck-window-link";
import useDeckHref from "../use-deck-href";

vi.mock("../use-is-premium", () => ({ __esModule: true, default: () => true }));

describe("deckHref", () => {
  it("leaves the default window out of the link", () => {
    expect(deckHref("garchomp-a2-123", "20d")).toBe("/deck/garchomp-a2-123");
  });

  it("carries every other window as a query parameter", () => {
    expect(deckHref("garchomp-a2-123", "10d")).toBe("/deck/garchomp-a2-123?window=10d");
    expect(deckHref("garchomp-a2-123", "30d")).toBe("/deck/garchomp-a2-123?window=30d");
    expect(deckHref("garchomp-a2-123", "all")).toBe("/deck/garchomp-a2-123?window=all");
  });

  it("keeps an ampersand slug intact", () => {
    expect(deckHref("a-a1-001&b-a1-002", "all")).toBe("/deck/a-a1-001&b-a1-002?window=all");
  });
});

describe("useDeckHref", () => {
  const wrapper =
    (initialWindow: "20d" | "30d") =>
    ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={new QueryClient()}>
        <MetaWindowProvider initialWindow={initialWindow}>{children}</MetaWindowProvider>
      </QueryClientProvider>
    );

  it("builds links for the selected window", () => {
    const { result } = renderHook(() => useDeckHref(), { wrapper: wrapper("30d") });

    expect(result.current("x-a1-001")).toBe("/deck/x-a1-001?window=30d");
  });

  it("builds plain links for the default window", () => {
    const { result } = renderHook(() => useDeckHref(), { wrapper: wrapper("20d") });

    expect(result.current("x-a1-001")).toBe("/deck/x-a1-001");
  });
});
