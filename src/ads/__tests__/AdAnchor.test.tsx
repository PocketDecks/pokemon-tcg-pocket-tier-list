import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import AdAnchor from "../AdAnchor";

const state = {
  showAds: true,
  reserved: true,
  useReal: true,
  blocked: false,
};

vi.mock("../useAdsState", () => ({
  default: () => ({ showAds: state.showAds, reserved: state.reserved, useReal: state.useReal }),
}));

vi.mock("../useAdBlocked", () => ({
  default: () => state.blocked,
}));

vi.mock("../AdSlot", () => ({
  default: () => null,
}));

vi.mock("../../components/Premium", () => ({
  default: () => null,
}));

const setViewport = (mobile: boolean) => {
  window.matchMedia = ((query: string) => ({
    matches: mobile,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
};

const anchorVar = () => document.documentElement.style.getPropertyValue("--ad-anchor-h");

const renderAnchor = () =>
  render(
    <MemoryRouter>
      <AdAnchor />
    </MemoryRouter>
  );

describe("AdAnchor reservation", () => {
  beforeEach(() => {
    state.showAds = true;
    state.reserved = true;
    state.useReal = true;
    state.blocked = false;
  });

  afterEach(() => {
    cleanup();
    document.documentElement.style.removeProperty("--ad-anchor-h");
  });

  it("reserves the mobile anchor height while the anchor is shown", () => {
    setViewport(true);
    renderAnchor();
    expect(screen.getByText("ads.advertisement")).toBeTruthy();
    expect(anchorVar()).toBe("79px");
  });

  it("reserves the desktop anchor height on wide viewports", () => {
    setViewport(false);
    renderAnchor();
    expect(anchorVar()).toBe("91px");
  });

  it("resets the reservation to zero and renders nothing when ads are not reserved", () => {
    setViewport(true);
    state.reserved = false;
    state.showAds = false;
    renderAnchor();
    expect(screen.queryByText("ads.advertisement")).toBeNull();
    expect(anchorVar()).toBe("0px");
  });

  it("removes the anchor and its reservation when the visitor dismisses it", () => {
    setViewport(true);
    renderAnchor();
    fireEvent.click(screen.getByLabelText("ads.close"));
    expect(screen.queryByText("ads.advertisement")).toBeNull();
    expect(anchorVar()).toBe("0px");
  });

  it("hides the anchor and resets the reservation when an ad blocker stops the ad", () => {
    setViewport(true);
    state.blocked = true;
    renderAnchor();
    expect(screen.queryByText("ads.advertisement")).toBeNull();
    expect(anchorVar()).toBe("0px");
  });
});
