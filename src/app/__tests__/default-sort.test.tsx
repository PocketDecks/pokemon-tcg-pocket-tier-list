import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import FilterContextProvider, { SortBy } from "../../components/FilterContext";
import useFilters from "../use-filters";

const Probe = () => {
  const { sortBy } = useFilters();
  return <p>{sortBy}</p>;
};

describe("default sort order", () => {
  it("defaults sortBy to Power Score inside the real provider", () => {
    render(
      <FilterContextProvider>
        <Probe />
      </FilterContextProvider>
    );

    expect(screen.getByText(SortBy.POWER)).toBeInTheDocument();
  });
});
