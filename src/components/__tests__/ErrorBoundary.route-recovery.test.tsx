import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes, useLocation } from "react-router";
import ErrorBoundary from "../ErrorBoundary";

const Boom = (): React.JSX.Element => {
  throw new Error("kaboom");
};

const Shell = () => {
  const { pathname } = useLocation();
  return (
    <ErrorBoundary resetKeys={[pathname]}>
      <Routes>
        <Route path="/crash" element={<Boom />} />
        <Route path="/healthy" element={<p>healthy page</p>} />
      </Routes>
    </ErrorBoundary>
  );
};

describe("ErrorBoundary route recovery", () => {
  let consoleError: MockInstance;

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it("renders the healthy route after a crash on another route", () => {
    render(
      <MemoryRouter initialEntries={["/crash"]}>
        <Shell />
        <Link to="/healthy">go healthy</Link>
      </MemoryRouter>
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();

    fireEvent.click(screen.getByText("go healthy"));

    expect(screen.getByText("healthy page")).toBeInTheDocument();
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
  });

  it("clears the error when resetKeys change", () => {
    const { rerender } = render(
      <ErrorBoundary resetKeys={["crash"]}>
        <Boom />
      </ErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();

    rerender(
      <ErrorBoundary resetKeys={["healthy"]}>
        <p>recovered</p>
      </ErrorBoundary>
    );

    expect(screen.getByText("recovered")).toBeInTheDocument();
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
  });

  it("keeps the error on a same-route re-render with equal keys", () => {
    let throws = true;
    const Recovering = (): React.JSX.Element => {
      if (throws) throw new Error("kaboom");
      return <p>recovered</p>;
    };
    const { rerender } = render(
      <ErrorBoundary resetKeys={["crash"]}>
        <Recovering />
      </ErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();

    throws = false;
    rerender(
      <ErrorBoundary resetKeys={["crash"]}>
        <Recovering />
      </ErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("keeps the error when resetKeys are unchanged", () => {
    const { rerender } = render(
      <ErrorBoundary resetKeys={["crash"]}>
        <Boom />
      </ErrorBoundary>
    );

    rerender(
      <ErrorBoundary resetKeys={["crash"]}>
        <Boom />
      </ErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });
});
