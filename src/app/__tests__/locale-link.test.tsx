import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { expect, it } from "vitest";
import { LocaleLink, LocaleNavLink, useLocaleHref } from "../locale-link";

const Href = ({ path }: { path: string }) => <output>{useLocaleHref(path)}</output>;

it.each([
  ["/", "/tier-list", "/tier-list/"],
  ["/ja/", "/tier-list", "/ja/tier-list/"],
  ["/", "/", "/"],
  ["/ja/", "/", "/ja/"],
  ["/", "/deck/umbreon-ex-a4-112&umbreon-c1-084", "/deck/umbreon-ex-a4-112&umbreon-c1-084/"],
  ["/", "/deck/hoopa-ex?window=30d", "/deck/hoopa-ex/?window=30d"],
  ["/", "/about#premium", "/about/#premium"],
  ["/", "/tier-list/", "/tier-list/"],
  ["/", "/robots.txt", "/robots.txt"],
  ["/", "https://example.com/x", "https://example.com/x"],
])("localises %s and formats %s", (initialEntry, to, href) => {
  render(<MemoryRouter initialEntries={[initialEntry]}><LocaleLink to={to}>{to}</LocaleLink></MemoryRouter>);
  expect(screen.getByRole("link")).toHaveAttribute("href", href);
});

it("adds a trailing slash to useLocaleHref paths", () => {
  render(<MemoryRouter initialEntries={["/"]}><Href path="/deck/x" /></MemoryRouter>);
  expect(screen.getByText("/deck/x/")).toBeInTheDocument();
});

it("leaves hash-only useLocaleHref values unchanged", () => {
  render(<MemoryRouter initialEntries={["/"]}><Href path="#top" /></MemoryRouter>);
  expect(screen.getByText("#top")).toBeInTheDocument();
});

it("keeps React Router's resolved href for a hash-only link", () => {
  render(<MemoryRouter initialEntries={["/"]}><LocaleLink to="#top">top</LocaleLink></MemoryRouter>);
  expect(screen.getByRole("link")).toHaveAttribute("href", "/#top");
});

it("keeps LocaleNavLink active at the slashed location", () => {
  render(<MemoryRouter initialEntries={["/tier-list/"]}><LocaleNavLink to="/tier-list">tier list</LocaleNavLink></MemoryRouter>);
  expect(screen.getByRole("link")).toHaveAttribute("href", "/tier-list/");
  expect(screen.getByRole("link")).toHaveAttribute("aria-current", "page");
});
