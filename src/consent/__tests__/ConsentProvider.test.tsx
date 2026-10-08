import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClassNameStyle } from "@c15t/ui/theme";
import { ThemeProvider, useTheme } from "../../contexts/ThemeContext";
import { themeTokens } from "../../styles/theme-tokens";
import { consentTheme } from "../consent-theme";
import ConsentProvider from "../ConsentProvider";

const APP_FONT_FAMILY =
  '"Manrope Variable", "Manrope", "Manrope Fallback", system-ui, -apple-system, "Segoe UI", sans-serif';

const mediaListeners: Array<(event: MediaQueryListEvent) => void> = [];

const slotStyle = (value: unknown): ClassNameStyle =>
  value as ClassNameStyle;

const themeStyleElement = (): string =>
  document.getElementById("c15t-theme")?.innerHTML ?? "";

beforeEach(() => {
  window.localStorage.clear();
  mediaListeners.length = 0;
  document.documentElement.className = "";
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.dataset.appVisible = "true";
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      matches: false,
      addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => {
        mediaListeners.push(listener);
      },
      removeEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => {
        const index = mediaListeners.indexOf(listener);
        if (index >= 0) mediaListeners.splice(index, 1);
      },
    })),
  });
});

describe("consentTheme", () => {
  it("builds the palette and colour scheme from the selected theme", () => {
    const dark = consentTheme("dark");
    const light = consentTheme("light");

    expect(dark.colorScheme).toBe("dark");
    expect(light.colorScheme).toBe("light");

    expect(dark.theme?.colors?.surface).toBe(themeTokens.dark.bg);
    expect(light.theme?.colors?.surface).toBe(themeTokens.light.bg);
    expect(dark.theme?.colors?.text).toBe(themeTokens.dark.text);
    expect(light.theme?.colors?.text).toBe(themeTokens.light.text);
    expect(dark.theme?.colors?.overlay).toBe(themeTokens.dark.overlay);
    expect(light.theme?.colors?.overlay).toBe(themeTokens.light.overlay);

    // c15t resolves the active palette from `colors` plus `dark`; both keys
    // carry the same tokens so the banner matches whichever scheme is active.
    expect(dark.theme?.dark).toEqual(dark.theme?.colors);
    expect(light.theme?.dark).toEqual(light.theme?.colors);
  });

  it("keeps the dark output equivalent to the previous dark theme", () => {
    const { theme } = consentTheme("dark");

    expect(theme?.colors?.primary).toBe(themeTokens.dark.a);
    expect(theme?.colors?.primaryHover).toBe(themeTokens.dark.b);
    expect(theme?.colors?.surfaceHover).toBe(themeTokens.dark["consent-surface-hover"]);
    expect(theme?.colors?.border).toBe(themeTokens.dark["line-strong"]);
    expect(theme?.colors?.borderHover).toBe(themeTokens.dark["white-22"]);
    expect(theme?.colors?.textMuted).toBe(themeTokens.dark["white-66"]);
    expect(theme?.colors?.textOnPrimary).toBe(themeTokens.dark["on-accent"]);

    expect(theme?.typography?.fontFamily).toBe(APP_FONT_FAMILY);
    expect(theme?.typography?.fontSize).toEqual({
      sm: "1.4rem",
      base: "1.6rem",
      lg: "2.2rem",
    });
    expect(theme?.spacing).toEqual({
      xs: "0.6rem",
      sm: "1rem",
      md: "1.6rem",
      lg: "2.4rem",
      xl: "3.2rem",
    });
    expect(theme?.radius).toEqual({
      sm: "0.8rem",
      md: "1.2rem",
      lg: "1.6rem",
      full: "9999px",
    });
    expect(theme?.consentActions).toEqual({
      accept: { variant: "primary", mode: "filled" },
      reject: { variant: "neutral", mode: "ghost" },
      customize: { variant: "neutral", mode: "ghost" },
    });

    const card = slotStyle(theme?.slots?.consentBannerCard);
    expect(card.style?.background).toBe(themeTokens.dark["consent-card"]);
    expect(card.style?.border).toBe(
      `1px solid ${themeTokens.dark["consent-card-border"]}`
    );
    expect(card.style?.boxShadow).toBe(
      `0 0.8rem 4rem ${themeTokens.dark["consent-shadow"]}`
    );

    const footer = slotStyle(theme?.slots?.consentBannerFooter);
    expect(footer.style?.background).toBe("transparent");
    expect(footer.style?.paddingTop).toBe("1.6rem");
  });
});

describe("ConsentProvider", () => {
  it("switches the c15t colour scheme and theme variables with the app theme", async () => {
    window.localStorage.setItem("theme", "dark");

    const Probe = () => {
      const { theme, toggle } = useTheme();
      return (
        <button type="button" aria-label="Current theme" onClick={toggle}>
          {theme}
        </button>
      );
    };

    render(
      <ThemeProvider>
        <ConsentProvider>
          <Probe />
        </ConsentProvider>
      </ThemeProvider>
    );

    expect(screen.getByRole("button", { name: "Current theme" })).toHaveTextContent("dark");
    await waitFor(() => expect(screen.getByTestId("consent-banner-card")).toBeInTheDocument());
    expect(screen.getByTestId("consent-banner-title")).toHaveTextContent("We value your privacy");
    expect(document.querySelector("#consent-dialog-root")).not.toBeInTheDocument();
    expect(document.documentElement.classList.contains("c15t-dark")).toBe(true);
    expect(themeStyleElement()).toContain(`--c15t-surface: ${themeTokens.dark.bg}`);

    await act(async () => {
      screen.getByRole("button", { name: "Current theme" }).click();
    });

    expect(screen.getByRole("button", { name: "Current theme" })).toHaveTextContent("light");
    await waitFor(() => expect(screen.getByTestId("consent-banner-card")).toBeInTheDocument());
    expect(screen.getByTestId("consent-banner-title")).toHaveTextContent("We value your privacy");
    expect(document.documentElement.classList.contains("c15t-dark")).toBe(false);
    expect(themeStyleElement()).toContain(`--c15t-surface: ${themeTokens.light.bg}`);
    expect(themeStyleElement()).not.toContain(`--c15t-surface: ${themeTokens.dark.bg}`);
  });
});
