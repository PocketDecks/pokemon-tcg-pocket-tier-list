import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes, useLocation } from "react-router";
import ErrorBoundary from "../ErrorBoundary";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

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
  it("resets when resetKeys shrink with an unchanged first key", () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { rerender } = render(<ErrorBoundary resetKeys={["same", "removed"]}><Boom /></ErrorBoundary>);
      expect(screen.getByRole("alert")).toBeInTheDocument();
      rerender(<ErrorBoundary resetKeys={["same"]}><p>recovered shorter keys</p></ErrorBoundary>);
      expect(screen.getByText("recovered shorter keys")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    } finally {
      errorLog.mockRestore();
    }
  });

  it("adopts keys added while healthy and resets only when they later differ", () => {
    let throws = false;
    const renderChild = vi.fn();
    const Recovering = (): React.JSX.Element => {
      renderChild();
      if (throws) throw new Error("kaboom");
      return <p>adopted content</p>;
    };
    const { rerender } = render(
      <ErrorBoundary>
        <Recovering />
      </ErrorBoundary>
    );
    expect(screen.getByText("adopted content")).toBeInTheDocument();

    rerender(
      <ErrorBoundary resetKeys={["A"]}>
        <Recovering />
      </ErrorBoundary>
    );
    expect(screen.getByText("adopted content")).toBeInTheDocument();
    expect(renderChild).toHaveBeenCalledTimes(2);

    throws = true;
    rerender(
      <ErrorBoundary resetKeys={["A"]}>
        <Recovering />
      </ErrorBoundary>
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();

    throws = false;
    rerender(
      <ErrorBoundary resetKeys={["A"]}>
        <Recovering />
      </ErrorBoundary>
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();

    rerender(
      <ErrorBoundary resetKeys={["B"]}>
        <Recovering />
      </ErrorBoundary>
    );
    expect(screen.getByText("adopted content")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("adopts keys added in the same render that first crashes", () => {
    const { rerender } = render(
      <ErrorBoundary>
        <p>keyless content</p>
      </ErrorBoundary>
    );
    expect(screen.getByText("keyless content")).toBeInTheDocument();

    rerender(
      <ErrorBoundary resetKeys={["A"]}>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();

    rerender(
      <ErrorBoundary resetKeys={["B"]}>
        <p>recovered after first keyed crash</p>
      </ErrorBoundary>
    );
    expect(screen.getByText("recovered after first keyed crash")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("adopts re-enabled keys as a new baseline after key removal", () => {
    const { rerender } = render(
      <ErrorBoundary resetKeys={["A"]}>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();

    rerender(
      <ErrorBoundary>
        <p>ignored while failed</p>
      </ErrorBoundary>
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();

    rerender(
      <ErrorBoundary resetKeys={["B"]}>
        <p>still failed after re-enable</p>
      </ErrorBoundary>
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();

    rerender(
      <ErrorBoundary resetKeys={["C"]}>
        <p>recovered after re-enabled keys change</p>
      </ErrorBoundary>
    );
    expect(screen.getByText("recovered after re-enabled keys change")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

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

    expect(screen.getByText("loadError.errorTitle")).toBeInTheDocument();

    fireEvent.click(screen.getByText("go healthy"));

    expect(screen.getByText("healthy page")).toBeInTheDocument();
    expect(screen.queryByText("loadError.errorTitle")).not.toBeInTheDocument();
  });

  it("recovers through A to B to A and resets on search-only changes", () => {
    const SearchShell = () => {
      const { pathname, search } = useLocation();
      return (
        <ErrorBoundary resetKeys={[pathname, search]}>
          {search === "?state=crash" ? <Boom /> : <p>{`healthy ${pathname}${search}`}</p>}
        </ErrorBoundary>
      );
    };
    render(
      <MemoryRouter initialEntries={["/a?state=crash"]}>
        <Link to="/b?state=healthy">go B</Link>
        <Link to="/a?state=healthy">go A healthy</Link>
        <Link to="/a?state=crash">go A crash</Link>
        <SearchShell />
      </MemoryRouter>
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();

    fireEvent.click(screen.getByText("go B"));
    expect(screen.getByText("healthy /b?state=healthy")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("go A healthy"));
    expect(screen.getByText("healthy /a?state=healthy")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("go A crash"));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByText("go A healthy"));
    expect(screen.getByText("healthy /a?state=healthy")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("clears the error when resetKeys change", () => {
    const { rerender } = render(
      <ErrorBoundary resetKeys={["crash"]}>
        <Boom />
      </ErrorBoundary>
    );

    expect(screen.getByText("loadError.errorTitle")).toBeInTheDocument();

    rerender(
      <ErrorBoundary resetKeys={["healthy"]}>
        <p>recovered</p>
      </ErrorBoundary>
    );

    expect(screen.getByText("recovered")).toBeInTheDocument();
    expect(screen.queryByText("loadError.errorTitle")).not.toBeInTheDocument();
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

    expect(screen.getByText("loadError.errorTitle")).toBeInTheDocument();

    throws = false;
    rerender(
      <ErrorBoundary resetKeys={["crash"]}>
        <Recovering />
      </ErrorBoundary>
    );

    expect(screen.getByText("loadError.errorTitle")).toBeInTheDocument();
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

    expect(screen.getByText("loadError.errorTitle")).toBeInTheDocument();
  });
});
