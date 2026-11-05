import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { ContentReadyProvider } from "../../../ads/ContentReadyContext";
import useAdsState from "../../../ads/useAdsState";

vi.mock("../../../app/use-is-premium", () => ({ default: () => false }));
vi.mock("../../../app/use-app-visible", () => ({ useAppVisible: () => true }));
vi.mock("../../../app/prerender", () => ({ isPrerender: false }));
vi.mock("../../../ads/adsConfig", () => ({ ADS_ENABLED: true, IS_DEV: false }));
vi.mock("@c15t/react", () => ({ useConsentManager: () => ({ has: () => true }) }));
const Ads = () => <output data-testid="ads">{String(useAdsState().showAds)}</output>;

import CardsListPage from "../CardsListPage";
const state = vi.hoisted(() => ({ mode: "empty" }));
vi.mock("../../../app/use-expansions", () => ({ default: () => [{ id: "b4a", name: "Team Rocket's Ambition", release_date: null, packs: [{ id: "b4a-booster", name: "Booster", image: "b4a.webp" }] }] }));

vi.mock("../../../app/use-cards", () => ({ default: () => ({
  error: state.mode === "error" ? new Error("503") : null,
  cards: state.mode === "error" ? null : state.mode === "empty" ? [] : [{ id: "b4a-001", name: "Volbeat", set: "b4a", pack: "Booster", score: 0.8 }],
  retry: vi.fn(),
}) }));
vi.mock("../../../components/CardIcon", () => ({ default: () => <span>card row</span> }));
vi.mock("../../../components/LastUpdated", () => ({ default: () => null }));

describe("CardsListPage content readiness", () => {
  it("settles error and empty screens without ads, and enables ads for rows", () => {
    state.mode = "good";
    const { rerender } = render(<MemoryRouter initialEntries={["/cards-list"]}><ContentReadyProvider><Routes><Route path="/cards-list" element={<CardsListPage />} /></Routes><Ads /></ContentReadyProvider></MemoryRouter>);
    expect(screen.getByTestId("ads")).toHaveTextContent("true");
    for (const mode of ["error", "empty", "good"]) {
      state.mode = mode;
      rerender(<MemoryRouter initialEntries={["/cards-list"]}><ContentReadyProvider><Routes><Route path="/cards-list" element={<CardsListPage />} /></Routes><Ads /></ContentReadyProvider></MemoryRouter>);
      expect(document.documentElement.dataset.routeReady).toBe("/cards-list");
      expect(screen.getByTestId("ads")).toHaveTextContent(String(mode === "good"));
    }
  });
});
