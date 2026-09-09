import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import TierGrid from "../../components/TierGrid";

type Item = { id: string; score: number; ranked: boolean };

const items: Item[] = [
  { id: "a", score: 90, ranked: true },
  { id: "b", score: 10, ranked: true },
  { id: "c", score: -1, ranked: false },
  { id: "d", score: -50, ranked: false },
];

const renderWith = (isRanked?: (item: Item) => boolean) =>
  render(
    <TierGrid
      items={items}
      getScore={(item) => item.score}
      getKey={(item) => item.id}
      renderItem={(item) => <span>{item.id}</span>}
      isRanked={isRanked}
    />
  );

describe("TierGrid ranked partition contract", () => {
  it("uses the isRanked predicate, not the score's sign, to split the rows", () => {
    renderWith((item) => item.ranked);

    // rankable items appear in the lettered tiers
    expect(screen.getByText("a")).toBeInTheDocument();
    expect(screen.getByText("b")).toBeInTheDocument();

    // negative-scoring items flagged unranked stay in the document
    expect(screen.getByText("c")).toBeInTheDocument();
    expect(screen.getByText("d")).toBeInTheDocument();
  });

  it("treats every item as rankable when isRanked is omitted", () => {
    renderWith();

    // a legitimately negative score is still banded into a tier, not the
    // unranked row, because the default predicate never rejects anything
    expect(screen.getByText("c")).toBeInTheDocument();
    expect(screen.getByText("d")).toBeInTheDocument();
  });

  it("puts only predicate-rejected items in the unranked row", () => {
    const { container } = renderWith((item) => item.ranked);

    // the unranked row is present and labelled with the neutral marker
    const unrankedRow = screen.getByTestId("unranked-row");
    expect(within(unrankedRow).getByText("?")).toBeInTheDocument();
    expect(within(unrankedRow).getByText("c")).toBeInTheDocument();
    expect(within(unrankedRow).getByText("d")).toBeInTheDocument();
    expect(unrankedRow).not.toContainElement(screen.getByText("a"));
    expect(unrankedRow).not.toContainElement(screen.getByText("b"));

    // the unranked row no longer reads as the E tier colour
    expect(container.innerHTML).not.toContain("var(--e)");
  });
});
