import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import NotFoundPage from "../NotFoundPage";

vi.mock("../../../ads/ContentReadyContext", () => ({
  __esModule: true,
  useMarkContentReady: vi.fn(),
}));

describe("NotFoundPage", () => {
  it("sends the tier list link to the tier list", () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>
    );
    expect(
      screen.getByRole("link", { name: "Back to the tier list" })
    ).toHaveAttribute("href", "/tier-list");
    expect(screen.queryByRole("main")).not.toBeInTheDocument();
  });
});
