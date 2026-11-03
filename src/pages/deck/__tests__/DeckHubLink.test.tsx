import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import DeckHubLink from "../DeckHubLink";

describe("DeckHubLink", () => {
  it("links a variant to every variant of its hub", () => {
    render(
      <MemoryRouter>
        <DeckHubLink variant="umbreon-ex-a4-112&greninja-a1-089" />
      </MemoryRouter>
    );
    const link = screen.getByRole("link", { name: /^All .+ variants$/ });
    expect(link.getAttribute("href")).toBe("/deck/umbreon-ex");
  });

  it("renders nothing for a variant outside the archive", () => {
    const { container } = render(
      <MemoryRouter>
        <DeckHubLink variant="does-not-exist" />
      </MemoryRouter>
    );
    expect(container.innerHTML).toBe("");
  });
});
