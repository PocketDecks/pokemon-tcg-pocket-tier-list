import { StrictMode, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Link, MemoryRouter, Route, Routes } from "react-router";
import { ContentReadyProvider, useMarkContentReady } from "../ContentReadyContext";
import useAdsState from "../useAdsState";
import { Layout } from "../../App";

const fault = vi.hoisted(() => ({ reached: vi.fn() }));
const i18n = vi.hoisted(() => ({ language: "en", changeLanguage: vi.fn() }));
const originalGpcDescriptor = Object.getOwnPropertyDescriptor(navigator, "globalPrivacyControl");
const originalRouteReady = document.documentElement.dataset.routeReady;

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n }),
}));
vi.mock("../../app/use-is-premium", () => ({ default: () => false }));
vi.mock("../../app/use-app-visible", () => ({ useAppVisible: () => true }));
vi.mock("../../app/prerender", () => ({ isPrerender: false }));
vi.mock("../adsConfig", () => ({ ADS_ENABLED: true, IS_DEV: false }));
vi.mock("@c15t/react", () => ({ useConsentManager: () => ({ has: () => true }) }));
vi.mock("../../app/use-document-language", () => ({ useDocumentLanguage: vi.fn() }));
vi.mock("../../components/Header", () => ({ default: () => <header />, RAIL_WIDTH: "9.2rem" }));
vi.mock("../../components/HomeBanner", () => ({ default: () => null }));
vi.mock("../../components/AdBlockerNotice", () => ({ default: () => null }));
vi.mock("../AdAnchor", () => ({ default: () => null }));

const Ads = () => <output data-testid="ads">{String(useAdsState().showAds)}</output>;

const ReadyOwner = ({ ready }: { ready: boolean }) => {
  useMarkContentReady(ready);
  return null;
};

const ReadyCrashPage = () => {
  const [crash, setCrash] = useState(false);
  useMarkContentReady(true);
  if (crash) {
    fault.reached();
    throw new Error("same path render crash");
  }
  return <button onClick={() => setCrash(true)}>crash route</button>;
};

const HealthyPage = () => {
  useMarkContentReady(true);
  return <p>healthy route</p>;
};

afterEach(() => {
  fault.reached.mockClear();
  if (originalGpcDescriptor) {
    Object.defineProperty(navigator, "globalPrivacyControl", originalGpcDescriptor);
  } else {
    Reflect.deleteProperty(navigator, "globalPrivacyControl");
  }
  if (originalRouteReady === undefined) {
    delete document.documentElement.dataset.routeReady;
  } else {
    document.documentElement.dataset.routeReady = originalRouteReady;
  }
  vi.unstubAllGlobals();
});

describe("content readiness ownership", () => {
  it("clears ads when the active owner becomes unready", () => {
    const tree = (ready: boolean) => (
      <MemoryRouter initialEntries={["/cards-list"]}>
        <ContentReadyProvider>
          <ReadyOwner ready={ready} />
          <Ads />
        </ContentReadyProvider>
      </MemoryRouter>
    );
    const { rerender } = render(tree(true));
    expect(screen.getByTestId("ads")).toHaveTextContent("true");

    rerender(tree(false));

    expect(screen.getByTestId("ads")).toHaveTextContent("false");
  });

  it("does not let an older owner's cleanup clear a newer owner on the same path", () => {
    const Owner = ({ name }: { name: string }) => {
      useMarkContentReady(true);
      return <span>{name}</span>;
    };
    const tree = (showOldOwner: boolean, showNewOwner: boolean) => (
      <MemoryRouter initialEntries={["/cards-list"]}>
        <ContentReadyProvider>
          {showOldOwner && <Owner key="old" name="old" />}
          {showNewOwner && <Owner key="new" name="new" />}
          <Ads />
        </ContentReadyProvider>
      </MemoryRouter>
    );
    const { rerender } = render(tree(true, false));
    rerender(tree(true, true));
    expect(screen.getByTestId("ads")).toHaveTextContent("true");

    rerender(tree(false, true));

    expect(screen.getByTestId("ads")).toHaveTextContent("true");
  });

  it("revokes readiness on a same-path Layout crash and restores it after healthy navigation", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    Object.defineProperty(navigator, "globalPrivacyControl", { configurable: true, value: false });
    try {
      render(
        <StrictMode>
          <MemoryRouter initialEntries={["/cards-list"]}>
            <ContentReadyProvider>
              <Routes>
                <Route element={<Layout />}>
                  <Route path="/cards-list" element={<ReadyCrashPage />} />
                  <Route path="/healthy" element={<HealthyPage />} />
                </Route>
              </Routes>
              <Link to="/healthy">go healthy</Link>
              <Ads />
            </ContentReadyProvider>
          </MemoryRouter>
        </StrictMode>
      );
      expect(screen.getByTestId("ads")).toHaveTextContent("true");

      fireEvent.click(screen.getByRole("button", { name: "crash route" }));

      expect(fault.reached).toHaveBeenCalled();
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByTestId("ads")).toHaveTextContent("false");
      expect(document.documentElement.dataset.routeReady).toBe("/cards-list");

      fireEvent.click(screen.getByRole("link", { name: "go healthy" }));

      expect(await screen.findByText("healthy route")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getByTestId("ads")).toHaveTextContent("true");
      expect(document.documentElement.dataset.routeReady).toBe("/healthy");
    } finally {
      consoleError.mockRestore();
    }
  });
});
