import { Suspense } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes, useLocation } from "react-router";
import { expect, it, vi } from "vitest";
import ErrorBoundary from "../../components/ErrorBoundary";
import { lazyRoute } from "../lazy-route";

it("retries a rejected route import when returning to the route", async () => {
  const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  let failing = true;
  const load = vi.fn(async () => {
    if (failing) throw new Error("chunk failed");
    return { default: ({ label }: { label: string }) => <p>{label}</p> };
  });
  const Page = lazyRoute(load);
  const Shell = () => {
    const { pathname } = useLocation();
    return <ErrorBoundary resetKeys={[pathname]}><Suspense fallback={<p>loading chunk</p>}><Routes><Route path="/a" element={<Page label="recovered chunk" />} /><Route path="/b" element={<p>healthy B</p>} /></Routes></Suspense></ErrorBoundary>;
  };
  try {
    render(<MemoryRouter initialEntries={["/a"]}><Link to="/a">go A</Link><Link to="/b">go B</Link><Shell /></MemoryRouter>);
    await screen.findByRole("alert");
    fireEvent.click(screen.getByText("go B"));
    expect(screen.getByText("healthy B")).toBeInTheDocument();
    failing = false;
    const attempts = load.mock.calls.length;
    fireEvent.click(screen.getByText("go A"));
    expect(await screen.findByText("recovered chunk")).toBeInTheDocument();
    expect(load.mock.calls.length).toBeGreaterThan(attempts);
  } finally {
    errorLog.mockRestore();
  }
});
