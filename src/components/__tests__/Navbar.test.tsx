import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import Navbar from "../Navbar";
import { UIProvider, useUI } from "../../contexts/UIContext";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => {
      const labels: Record<string, string> = {
        "header.tierList": "Tier List",
        "header.bestDeckFinder": "Best Deck Finder",
        "header.bestCards": "Best Cards",
        "header.bestExpansions": "Best Expansions",
        "header.statistics": "Statistics",
      };
      return labels[key] ?? fallback ?? key;
    },
  }),
}));

// The app's responsive hook (useIsMobile) reads window.matchMedia. jsdom has
// no layout engine, so we stub it to a fixed viewport for each test.
let mobile = false;

const UIProbe = () => {
  const { isNavOpen } = useUI();
  return <span data-testid="navopen-probe">{String(isNavOpen)}</span>;
};

const NavOpener = () => {
  const { toggleNav } = useUI();
  return <button onClick={toggleNav}>Open navigation</button>;
};

const renderNavbar = ({ path = "/" }: { path?: string } = {}) =>
  render(
    <UIProvider>
      <MemoryRouter initialEntries={[path]}>
        <UIProbe />
        <NavOpener />
        <main id="main-content" tabIndex={-1} />
        <Navbar />
      </MemoryRouter>
    </UIProvider>
  );

beforeEach(() => {
  mobile = false;
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: () => ({
      matches: mobile,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
});

describe("Navbar", () => {
  it("renders the primary routes as links on desktop", () => {
    renderNavbar();
    expect(screen.getByRole("link", { name: /tier list/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /best cards/i })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /best deck finder/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /statistics/i })).toBeInTheDocument();
  });

  it("closes the mobile nav and moves focus to main content after navigation", async () => {
    mobile = true;
    renderNavbar();
    expect(screen.getByTestId("navopen-probe")).toHaveTextContent("false");

    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(screen.getByTestId("navopen-probe")).toHaveTextContent("true");
    fireEvent.click(screen.getByRole("link", { name: /tier list/i }));

    expect(screen.getByTestId("navopen-probe")).toHaveTextContent("false");
    await waitFor(() => expect(screen.getByRole("main")).toHaveFocus());
  });

  it("marks only the current route as the current page", () => {
    renderNavbar({ path: "/tier-list" });
    expect(screen.getByRole("link", { name: /tier list/i })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(
      screen.getByRole("link", { name: /best deck finder/i })
    ).not.toHaveAttribute("aria-current");
  });

  it("does not mark the deck finder current on a deck detail page", () => {
    renderNavbar({ path: "/deck/greninja-a1-089" });
    expect(
      screen.getByRole("link", { name: /best deck finder/i })
    ).not.toHaveAttribute("aria-current");
  });
});