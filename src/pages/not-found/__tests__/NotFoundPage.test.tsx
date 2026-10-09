import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import NotFoundPage from "../NotFoundPage";
import "../../../i18n";

vi.mock("../../../ads/ContentReadyContext", () => ({
  __esModule: true,
  useMarkContentReady: vi.fn(),
}));

describe("NotFoundPage", () => {
  it("sends the tier list link to the tier list", async () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>
    );
    expect(
      await screen.findByRole("link", { name: "Back to the tier list" })
    ).toHaveAttribute("href", "/tier-list");
    expect(screen.queryByRole("main")).not.toBeInTheDocument();
  });

  it("explains a retired deck URL and links to the tier list and deck finder", async () => {
    render(
      <MemoryRouter initialEntries={["/deck/hydreigon-b1-157/"]}>
        <NotFoundPage />
      </MemoryRouter>
    );
    expect(
      await screen.findByText("This deck is no longer in the current meta.")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to the tier list" })
    ).toHaveAttribute("href", "/tier-list/");
    expect(
      screen.getByRole("link", { name: "Browse all decks" })
    ).toHaveAttribute("href", "/deck/");
  });
});
