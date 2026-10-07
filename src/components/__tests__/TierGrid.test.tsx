import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import TierGrid from "../TierGrid";

describe("TierGrid", () => {
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