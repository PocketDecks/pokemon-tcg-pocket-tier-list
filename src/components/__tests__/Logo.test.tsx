import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import Logo from "../Logo";

describe("Logo", () => {
  it("keeps the intrinsic square ratio when CSS sizes it", () => {
    render(
      <MemoryRouter>
        <Logo />
      </MemoryRouter>
    );

    const logo = screen.getByRole("img", { name: "Top Pocket Decks" });
    expect(logo).toHaveAttribute("width", "160");
    expect(logo).toHaveAttribute("height", "160");
  });
});
