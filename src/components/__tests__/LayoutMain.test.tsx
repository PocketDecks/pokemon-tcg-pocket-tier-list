import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { Layout } from "../../App";
import LayoutMain from "../LayoutMain";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("../Header", () => ({ default: () => null, RAIL_WIDTH: "8rem" }));
vi.mock("../HomeBanner", () => ({ default: () => null }));
vi.mock("../AdBlockerNotice", () => ({ default: () => null }));
vi.mock("../../ads/AdAnchor", () => ({ default: () => null }));
vi.mock("../../config/firebase", () => ({
  auth: {},
  googleProvider: {},
  getPayments: vi.fn(),
}));

describe("LayoutMain", () => {
  it("keeps the main area at least one viewport tall so the footer starts below the fold", () => {
    render(<LayoutMain data-testid="layout-main">content</LayoutMain>);

    expect(getComputedStyle(screen.getByTestId("layout-main")).minHeight).toBe("100dvh");
  });

  it("wraps the routed content in the layout's main landmark", () => {
    render(
      <MemoryRouter initialEntries={["/tier-list"]}>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route path="tier-list" element={<p>routed content</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main-content");
    expect(within(main).getByText("routed content")).toBeInTheDocument();
    expect(getComputedStyle(main).minHeight).toBe("100dvh");
  });
});
