import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import AdSlot from "../AdSlot";

vi.mock("../useAdsState", () => ({
  default: () => ({ showAds: true, reserved: true, useReal: true }),
}));

vi.mock("../adsense", () => ({
  ensureAdSenseScript: () => {},
  pushAd: () => {},
}));

vi.mock("../adsConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../adsConfig")>()),
  ADSENSE_CLIENT: "ca-pub-test",
}));

const renderSlot = (fullWidthResponsive?: boolean) =>
  render(
    <MemoryRouter>
      <AdSlot placement="anchor" format="horizontal" fullWidthResponsive={fullWidthResponsive} />
    </MemoryRouter>
  );

describe("AdSlot full width responsive flag", () => {
  afterEach(cleanup);

  it("keeps full width responsive on by default", () => {
    const { container } = renderSlot();
    expect(container.querySelector("ins")?.getAttribute("data-full-width-responsive")).toBe("true");
  });

  it("turns it off when the caller asks", () => {
    const { container } = renderSlot(false);
    expect(container.querySelector("ins")?.getAttribute("data-full-width-responsive")).toBe("false");
  });
});
