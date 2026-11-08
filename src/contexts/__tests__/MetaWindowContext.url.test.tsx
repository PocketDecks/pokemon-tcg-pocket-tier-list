import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MetaWindowProvider, useMetaWindow } from "../MetaWindowContext";

const premium = vi.hoisted(() => ({ value: true as boolean | null }));

vi.mock("../../app/use-is-premium", () => ({
  __esModule: true,
  default: () => premium.value,
}));

const Probe = () => <p data-testid="window">{useMetaWindow().window}</p>;

const renderAt = (url: string, initialWindow?: "10d" | "20d" | "30d" | "all") => {
  window.history.pushState({}, "", url);
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MetaWindowProvider initialWindow={initialWindow}>
        <Probe />
      </MetaWindowProvider>
    </QueryClientProvider>
  );
};

afterEach(() => {
  window.history.pushState({}, "", "/");
  premium.value = true;
});

describe("MetaWindowProvider initial window from the URL", () => {
  it("starts on the window named in the URL", () => {
    renderAt("/deck/x-a1-001?window=30d");

    expect(screen.getByTestId("window")).toHaveTextContent("30d");
  });

  it("accepts the free 10-day window", () => {
    renderAt("/deck/x-a1-001?window=10d");

    expect(screen.getByTestId("window")).toHaveTextContent("10d");
  });

  it("keeps a premium window while premium status is unknown", () => {
    premium.value = null;
    renderAt("/deck/x-a1-001?window=all");

    expect(screen.getByTestId("window")).toHaveTextContent("all");
  });

  it("falls back to the default window for a signed-out or free viewer", () => {
    premium.value = false;
    renderAt("/deck/x-a1-001?window=30d");

    expect(screen.getByTestId("window")).toHaveTextContent("20d");
  });

  it("ignores a window id it does not know", () => {
    renderAt("/deck/x-a1-001?window=40d");

    expect(screen.getByTestId("window")).toHaveTextContent("20d");
  });

  it("uses the default window when the URL names none", () => {
    renderAt("/deck/x-a1-001");

    expect(screen.getByTestId("window")).toHaveTextContent("20d");
  });

  it("lets an explicit initial window override the URL", () => {
    renderAt("/deck/x-a1-001?window=all", "10d");

    expect(screen.getByTestId("window")).toHaveTextContent("10d");
  });
});
