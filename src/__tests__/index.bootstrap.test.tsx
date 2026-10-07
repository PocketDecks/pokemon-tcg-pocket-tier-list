import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  events: [] as string[],
  release: undefined as (() => void) | undefined,
}));

vi.mock("../app/routes", () => ({
  preloadRoute: vi.fn(() => {
    state.events.push("preload-start");
    return new Promise<void>((resolve) => {
      state.release = () => {
        state.events.push("preload-end");
        resolve();
      };
    });
  }),
}));

vi.mock("../App", () => {
  state.events.push("app-import");
  return { default: () => null };
});

vi.mock("react-dom/client", () => ({
  createRoot: vi.fn(() => ({
    render: () => state.events.push("render"),
  })),
}));

vi.mock("../reportWebVitals", () => ({ default: vi.fn() }));
vi.mock("../i18n", () => ({}));
vi.mock("../app/preload-reload-guard", () => ({ handlePreloadError: vi.fn() }));
vi.mock("../styles/GlobalStyles", () => ({ default: () => null }));
vi.mock("react-router", () => ({
  BrowserRouter: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../components/MissingContext", () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../components/FilterContext", () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../contexts/UIContext", () => ({
  UIProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../consent/ConsentProvider", () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));

describe("bootstrap ordering", () => {
  beforeEach(() => {
    state.events.length = 0;
    state.release = undefined;
    document.body.innerHTML = '<div id="root"></div>';
    vi.resetModules();
  });

  it("preloads the route before evaluating App and rendering", async () => {
    await import("../index");

    expect(state.events).toEqual(["preload-start"]);

    state.release?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(state.events).toEqual([
      "preload-start",
      "preload-end",
      "app-import",
      "render",
    ]);
  });
});
