import { themeTokens, type ThemeName } from "../styles/theme-tokens";

export const STORAGE_KEY = "theme";
const THEME_QUERY = "(prefers-color-scheme: light)";

const isThemeName = (value: string | null | undefined): value is ThemeName =>
  value === "dark" || value === "light";

export const readStoredTheme = (): ThemeName | null => {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return isThemeName(value) ? value : null;
  } catch {
    return null;
  }
};

export const storeTheme = (name: ThemeName): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, name);
  } catch {
    return;
  }
};

export const systemTheme = (): ThemeName => {
  try {
    return window.matchMedia(THEME_QUERY).matches ? "light" : "dark";
  } catch {
    return "dark";
  }
};

export const applyTheme = (name: ThemeName): void => {
  try {
    const root = document.documentElement;
    root.dataset.theme = name;
    root.style.colorScheme = name;
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      "content",
      themeTokens[name]["surface-sunk"]
    );
  } catch {
    return;
  }
};

export const resolveTheme = (): ThemeName => readStoredTheme() ?? systemTheme();

export const themeFromDocument = (): ThemeName => {
  const value = document.documentElement.dataset.theme;
  return isThemeName(value) ? value : resolveTheme();
};
