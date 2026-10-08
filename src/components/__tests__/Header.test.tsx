import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { ConsentManagerProvider } from "@c15t/react";
import Header from "../Header";
import { UIProvider } from "../../contexts/UIContext";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      (
        {
          "a11y.openMenu": "Open menu",
          "a11y.closeMenu": "Close menu",
          "a11y.primaryNav": "Main navigation",
          "footer.about": "About",
          "footer.privacySettings": "Privacy settings",
        } as Record<string, string>
      )[key] ?? key,
  }),
}));

vi.mock("../UserAccount", () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock("../LanguageSwitcher", () => ({
  __esModule: true,
  default: () => null,
}));

let mobile = true;

beforeEach(() => {
  mobile = true;
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: () => ({
      matches: mobile,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
});

const renderHeader = (footer = false) =>
  render(
    <ConsentManagerProvider options={{ mode: "offline" }}>
      <UIProvider>
        <MemoryRouter>
          <Header footer={footer} />
        </MemoryRouter>
      </UIProvider>
    </ConsentManagerProvider>
  );

describe("Header", () => {
  it("renders the top bar as the page banner landmark", () => {
    renderHeader();
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Main navigation" })
    ).toBeInTheDocument();
  });

  it("renders the footer without a second banner or navigation", () => {
    renderHeader(true);
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "About" })).toBeInTheDocument();
  });

  it("names the footer consent link after its visible text", () => {
    renderHeader(true);
    expect(
      screen.getByRole("button", { name: "Privacy settings" })
    ).toBeInTheDocument();
  });

  it("closes the mobile menu on Escape and returns focus to the menu button", () => {
    renderHeader();
    fireEvent.click(screen.getByLabelText("Open menu"));
    const closeButton = screen.getByLabelText("Close menu");
    expect(closeButton).toHaveAttribute("aria-expanded", "true");

    fireEvent.keyDown(document, { key: "Escape" });

    const openButton = screen.getByLabelText("Open menu");
    expect(openButton).toHaveAttribute("aria-expanded", "false");
    expect(openButton).toHaveFocus();
  });
});
