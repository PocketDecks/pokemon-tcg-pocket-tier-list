import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import {
  CONSENT_BANNER_HEIGHT_PROPERTY,
  useConsentBannerHeight,
} from "../consent-banner-height";

const Harness = ({ enabled }: { enabled: boolean }) => {
  useConsentBannerHeight(enabled);
  return <div data-testid="consent-banner-root" />;
};

const stubBannerHeight = (height: number) => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
    this: Element
  ) {
    const isBanner = this.getAttribute("data-testid") === "consent-banner-root";
    const value = isBanner ? height : 0;
    return {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: value,
      width: 0,
      height: value,
      toJSON: () => ({}),
    } as DOMRect;
  });
};

const reservedHeight = () =>
  document.documentElement.style.getPropertyValue(CONSENT_BANNER_HEIGHT_PROPERTY);

describe("useConsentBannerHeight", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    document.documentElement.style.removeProperty(CONSENT_BANNER_HEIGHT_PROPERTY);
  });

  it("publishes the measured banner height as a CSS variable", () => {
    stubBannerHeight(312);
    render(<Harness enabled />);

    expect(reservedHeight()).toBe("312px");
  });

  it("publishes zero when the banner is absent", () => {
    stubBannerHeight(0);
    render(
      <div>
        <Harness enabled />
      </div>
    );
    expect(reservedHeight()).toBe("0px");
  });

  it("clears the variable when disabled", () => {
    stubBannerHeight(312);
    const { rerender } = render(<Harness enabled />);
    expect(reservedHeight()).toBe("312px");

    rerender(<Harness enabled={false} />);
    expect(reservedHeight()).toBe("");
  });
});
