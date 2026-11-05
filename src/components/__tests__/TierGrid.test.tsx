import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import TierGrid from "../TierGrid";

describe("TierGrid", () => {
  it.each([
    { state: "loading", items: null },
    { state: "empty", items: [] },
    { state: "loaded", items: [{ id: "card", score: 1 }] },
  ])("keeps filters in the page shell and replaces $state rows with an error", ({ items }) => {
    const props = {
      items,
      getScore: (item: { score: number }) => item.score,
      getKey: (item: { id: string }) => item.id,
      renderItem: () => <span>card row</span>,
      filters: <button>Filter</button>,
      footer: <span>Updated</span>,
    };
    const { rerender } = render(<TierGrid {...props} error={<div role="alert">Retry cards</div>} />);

    const notice = screen.getByRole("alert");
    expect(notice).toHaveTextContent("Retry cards");
    expect(notice.parentElement).toBe(screen.getByRole("button", { name: "Filter" }).parentElement?.parentElement);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText("card row")).not.toBeInTheDocument();
    expect(screen.queryByText("S")).not.toBeInTheDocument();
    expect(screen.queryByText("Updated")).not.toBeInTheDocument();

    rerender(<TierGrid {...props} items={[{ id: "card", score: 1 }]} />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("card row")).toBeInTheDocument();
    expect(screen.getByText("Updated")).toBeInTheDocument();
  });

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
