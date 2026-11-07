import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigationType } from "react-router";
import useWindowSearchParam from "../use-window-search-param";

const selected = vi.hoisted(() => ({ window: "20d" as "10d" | "20d" | "30d" | "all" }));

vi.mock("../use-meta-window", () => ({
  useMetaWindow: () => ({ window: selected.window, setWindow: () => {} }),
}));

const Probe = () => {
  useWindowSearchParam();
  const location = useLocation();
  return (
    <>
      <p data-testid="search">{location.search}</p>
      <p data-testid="type">{useNavigationType()}</p>
    </>
  );
};

const renderAt = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Probe />
    </MemoryRouter>
  );

describe("useWindowSearchParam", () => {
  it("writes a non-default window into the URL by replacing the entry", () => {
    selected.window = "30d";
    renderAt("/deck/x-a1-001");

    expect(screen.getByTestId("search")).toHaveTextContent("?window=30d");
    expect(screen.getByTestId("type")).toHaveTextContent("REPLACE");
  });

  it("removes the parameter for the default window", () => {
    selected.window = "20d";
    renderAt("/deck/x-a1-001?window=30d");

    expect(screen.getByTestId("search")).toHaveTextContent("");
    expect(screen.getByTestId("search").textContent).toBe("");
    expect(screen.getByTestId("type")).toHaveTextContent("REPLACE");
  });

  it("follows the selected window when it changes", () => {
    selected.window = "30d";
    const { rerender } = renderAt("/deck/x-a1-001?window=30d");
    expect(screen.getByTestId("search")).toHaveTextContent("?window=30d");

    selected.window = "all";
    rerender(
      <MemoryRouter initialEntries={["/deck/x-a1-001?window=30d"]}>
        <Probe />
      </MemoryRouter>
    );

    expect(screen.getByTestId("search")).toHaveTextContent("?window=all");
  });

  it("leaves a URL that already matches alone", () => {
    selected.window = "10d";
    renderAt("/deck/x-a1-001?window=10d");

    expect(screen.getByTestId("search")).toHaveTextContent("?window=10d");
    expect(screen.getByTestId("type")).toHaveTextContent("POP");
  });

  it("replaces an unknown window value", () => {
    selected.window = "20d";
    renderAt("/deck/x-a1-001?window=bogus");

    expect(screen.getByTestId("search").textContent).toBe("");
  });

  it("keeps other query parameters", () => {
    selected.window = "all";
    renderAt("/deck/x-a1-001?ref=share");

    expect(screen.getByTestId("search").textContent).toBe("?ref=share&window=all");
  });
});
