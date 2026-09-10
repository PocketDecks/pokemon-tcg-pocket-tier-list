import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import TierGrid from "../../components/TierGrid";

type Item = { id: string; score: number; ranked: boolean };

// The two columns must disagree somewhere. Every row below satisfies
// ranked === (score >= 0), so a predicate split and a sign split produce the
// same partition and no test can tell them apart.
const items: Item[] = [
  { id: "e", score: -5, ranked: true },
  { id: "f", score: 10, ranked: false },
  { id: "g", score: 90, ranked: true },
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
  it("bands a negatively scored item the predicate accepts", () => {
    renderWith((item) => item.ranked);

    // e scores -5 and is ranked, so it belongs in a tier. A grid that inferred
    // rankedness from the sign would dump it into the unranked row instead.
    const unrankedRow = screen.getByTestId("unranked-row");
    expect(within(unrankedRow).queryByText("e")).toBeNull();
    expect(screen.getByText("e")).toBeInTheDocument();
  });

  it("unranked an item with a positive score the predicate rejects", () => {
    renderWith((item) => item.ranked);

    // f scores 10 and is unranked, so it belongs in the unranked row even
    // though its score is positive.
    const unrankedRow = screen.getByTestId("unranked-row");
    expect(within(unrankedRow).getByText("f")).toBeInTheDocument();
  });

  it("renders no unranked row when every item is rankable", () => {
    renderWith(() => true);
    expect(screen.queryByTestId("unranked-row")).toBeNull();
    expect(screen.getByText("e")).toBeInTheDocument();
  });

  it("treats every item as rankable when isRanked is omitted", () => {
    renderWith();

    // The default predicate never rejects, so the negative-scoring item is
    // banded and there is no unranked row at all.
    expect(screen.queryByTestId("unranked-row")).toBeNull();
    expect(screen.getByText("e")).toBeInTheDocument();
  });

  it("keeps the unranked row visually distinct from the bottom tier", () => {
    renderWith((item) => item.ranked);

    // Read the compiled style, since a styled-component never puts the
    // custom property in the HTML.
    const header = within(screen.getByTestId("unranked-row")).getByText("?");
    const background = getComputedStyle(header).backgroundColor;
    expect(background).not.toBe("");
  });
});
