import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import TierGrid from "../TierGrid";

describe("TierGrid empty states", () => {
  it("renders filters with the empty notice", () => {
    render(
      <TierGrid
        items={[]}
        getScore={() => 0}
        getKey={() => "item"}
        renderItem={() => null}
        filters={<select aria-label="Card expansion" defaultValue="a2a" />}
        emptyLabel="No cards found"
      />
    );

    expect(screen.getByRole("combobox", { name: "Card expansion" })).toBeInTheDocument();
    expect(screen.getByText("No cards found")).toBeInTheDocument();
  });

  it("renders filters with the loading notice", () => {
    render(
      <TierGrid
        items={null}
        getScore={() => 0}
        getKey={() => "item"}
        renderItem={() => null}
        filters={<select aria-label="Card expansion" />}
      />
    );

    expect(screen.getByRole("combobox", { name: "Card expansion" })).toBeInTheDocument();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });
});
