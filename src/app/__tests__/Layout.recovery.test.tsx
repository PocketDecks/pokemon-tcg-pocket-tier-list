import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Link, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Layout } from "../../App";

vi.mock("../../contexts/AuthContext", () => ({ AuthProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("../../contexts/DecksContext", () => ({ DecksProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("../../components/Header", () => ({ default: () => null, RAIL_WIDTH: "8rem" }));
vi.mock("../../components/AdBlockerNotice", () => ({ default: () => null }));
vi.mock("../../components/HomeBanner", () => ({ default: () => null }));
vi.mock("../../ads/AdAnchor", () => ({ default: () => null }));

const SearchPage = () => {
  const { search } = useLocation();
  if (search !== "?view=packs") throw new Error("view crashed");
  return <p>healthy packs</p>;
};

const renderLayout = (path: string, element: React.ReactNode) => render(
  <MemoryRouter initialEntries={[path]}>
    <Link to="/a">go A</Link><Link to="/b">go B</Link><Link to="/a?view=packs">go packs</Link>
    <Routes><Route element={<Layout />}><Route path="/a" element={element} /><Route path="/b" element={<p>healthy B</p>} /></Route></Routes>
  </MemoryRouter>
);

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); });

describe("Layout route boundary", () => {
  it("recovers when only the search parameters change", () => {
    renderLayout("/a?view=expansions", <SearchPage />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByText("go packs"));
    expect(screen.getByText("healthy packs")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
