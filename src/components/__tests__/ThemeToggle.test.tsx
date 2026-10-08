import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ThemeName } from "../../styles/theme-tokens";

const themeHarness = vi.hoisted(() => ({
  initialTheme: "dark" as ThemeName,
  toggle: vi.fn(),
}));

vi.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => {
    const [theme, setTheme] = useState<ThemeName>(themeHarness.initialTheme);
    return {
      theme,
      toggle: () => {
        themeHarness.toggle();
        setTheme((current) => (current === "dark" ? "light" : "dark"));
      },
    };
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      (
        {
          "a11y.switchToLight": "Switch to light mode",
          "a11y.switchToDark": "Switch to dark mode",
        } as Record<string, string>
      )[key] ?? key,
  }),
}));

import ThemeToggle from "../ThemeToggle";

beforeEach(() => {
  themeHarness.initialTheme = "dark";
  themeHarness.toggle.mockClear();
});

describe("ThemeToggle", () => {
  it("names the light action while the dark theme is active", () => {
    render(<ThemeToggle />);
    const button = screen.getByRole("button", { name: "Switch to light mode" });
    expect(button).toHaveAttribute("title", "Switch to light mode");
  });

  it("names the dark action while the light theme is active", () => {
    themeHarness.initialTheme = "light";
    render(<ThemeToggle />);
    const button = screen.getByRole("button", { name: "Switch to dark mode" });
    expect(button).toHaveAttribute("title", "Switch to dark mode");
  });

  it("calls toggle and flips the label on click", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.click(screen.getByRole("button", { name: "Switch to light mode" }));
    expect(themeHarness.toggle).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Switch to dark mode" })
    ).toBeInTheDocument();
  });

  it("toggles with Enter when reached by keyboard", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.tab();
    expect(screen.getByRole("button", { name: "Switch to light mode" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(themeHarness.toggle).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Switch to dark mode" })
    ).toBeInTheDocument();
  });
});
