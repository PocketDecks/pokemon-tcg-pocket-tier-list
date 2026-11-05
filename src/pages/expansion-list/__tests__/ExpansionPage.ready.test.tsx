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

import ExpansionPage from "../ExpansionPage";
const state = vi.hoisted(() => ({ mode: "empty" }));
vi.mock("../../../app/use-expansions", () => ({ default: () => [{ id: "b4a", name: "Team Rocket's Ambition", release_date: null, packs: [{ id: "b4a-booster", name: "Booster", image: "b4a.webp" }] }] }));

vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ isSuccess: state.mode !== "error", isError: state.mode === "error", data: { cards: [] } }) }));
vi.mock("../../../app/use-decks", () => ({ useDecks: () => ({ decks: [], rawDecks: [], loading: false }) }));
vi.mock("../../../app/expansion-page-data", () => ({ packNameForSlug: () => null, expansionPageData: () => ({ cards: state.mode === "good" ? [{ id: "b4a-001", name: "Volbeat" }] : [], decks: [] }) }));

describe("ExpansionPage content readiness", () => {
  it("settles error and empty screens without ads, and enables ads for rows", () => {
    state.mode = "good";
    const { rerender } = render(<MemoryRouter initialEntries={["/expansion-list/b4a"]}><ContentReadyProvider><Routes><Route path="/expansion-list/:expansionId" element={<ExpansionPage />} /></Routes><Ads /></ContentReadyProvider></MemoryRouter>);
    expect(screen.getByTestId("ads")).toHaveTextContent("true");
    for (const mode of ["error", "empty", "good"]) {
      state.mode = mode;
      rerender(<MemoryRouter initialEntries={["/expansion-list/b4a"]}><ContentReadyProvider><Routes><Route path="/expansion-list/:expansionId" element={<ExpansionPage />} /></Routes><Ads /></ContentReadyProvider></MemoryRouter>);
      expect(document.documentElement.dataset.routeReady).toBe("/expansion-list/b4a");
      expect(screen.getByTestId("ads")).toHaveTextContent(String(mode === "good"));
    }
  });
});
