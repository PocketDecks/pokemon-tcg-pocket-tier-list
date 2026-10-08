import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import LayoutMain from "../LayoutMain";

describe("LayoutMain", () => {
  it("keeps the main area at least one viewport tall so the footer starts below the fold", () => {
    render(<LayoutMain data-testid="layout-main">content</LayoutMain>);

    expect(getComputedStyle(screen.getByTestId("layout-main")).minHeight).toBe("100dvh");
  });
});
