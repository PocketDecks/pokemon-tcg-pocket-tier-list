import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { render, screen } from "@testing-library/react";
import ErrorBoundary from "../ErrorBoundary";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const Boom = (): React.JSX.Element => {
  throw new Error("kaboom");
};

describe("ErrorBoundary", () => {
  let consoleError: MockInstance;

  beforeEach(() => {
    // React logs the caught error too, which clutters the run.
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it("renders its children when nothing throws", () => {
    render(
      <ErrorBoundary>
        <p>all good</p>
      </ErrorBoundary>
    );

    expect(screen.getByText("all good")).toBeInTheDocument();
  });

  it("renders the fallback when a child throws", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("loadError.errorTitle")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "loadError.reload" })
    ).toBeInTheDocument();
  });

  it("logs the error it caught", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );

    expect(consoleError).toHaveBeenCalledWith(
      "Uncaught render error:",
      expect.objectContaining({ message: "kaboom" }),
      expect.anything()
    );
  });
});
