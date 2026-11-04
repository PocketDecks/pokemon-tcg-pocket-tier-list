import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import TierGrid from "../TierGrid";

describe("TierGrid", () => {
  it("announces loading as busy and clears busy for empty results", () => {
    const props = { getScore: () => 0, getKey: () => "item", renderItem: () => null };
    const { rerender } = render(<TierGrid items={null} {...props} />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    rerender(<TierGrid items={[]} {...props} />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "false");
  });

  it("sizes the loading state to its containing column", () => {
    render(
      <TierGrid
        items={null}
        getScore={() => 0}
        getKey={() => "item"}
        renderItem={() => null}
      />
    );

    expect(screen.getByText("Loading...")).toHaveStyle({
      height: "100%",
      width: "100%",
    });
  });
});
