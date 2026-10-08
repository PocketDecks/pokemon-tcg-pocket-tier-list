import { readFileSync } from "node:fs";
import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  applyTheme,
  readStoredTheme,
  resolveTheme,
  systemTheme,
} from "../theme";
import { themeTokens } from "../../styles/theme-tokens";

const html = readFileSync("index.html", "utf8");
const inlineScript = html.match(/<script data-theme-init="true">([\s\S]*?)<\/script>/)?.[1];

if (!inlineScript) throw new Error("Theme initialisation script is missing");

const nativeLocalStorage = window.localStorage;

const runInlineScript = (stored: string | null, system: "dark" | "light") => {
  const storage = {
    getItem: vi.fn(() => stored),
  };
  const media = { matches: system === "light" };
  Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => media) });
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.style.removeProperty("color-scheme");
  document.querySelector('meta[name="theme-color"]')?.remove();
  new Function("window", "document", "localStorage", "matchMedia", inlineScript)(
    window,
    document,
    storage,
    window.matchMedia
  );
  return {
    theme: document.documentElement.dataset.theme,
    colorScheme: document.documentElement.style.colorScheme,
    themeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute("content"),
  };
};

describe("theme helpers", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: nativeLocalStorage,
    });
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.style.removeProperty("color-scheme");
    document.head.innerHTML = '<meta name="theme-color" content="#030303" />';
  });

  it.each([
    ["dark", "dark"],
    ["light", "light"],
  ] as const)("stored %s value wins over the system", (stored, expected) => {
    window.localStorage.setItem("theme", stored);
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({ matches: expected === "dark" })),
    });

    expect(readStoredTheme()).toBe(expected);
    expect(resolveTheme()).toBe(expected);
  });

  it.each([
    [false, "dark"],
    [true, "light"],
  ] as const)("follows the %s system preference without a stored value", (matches, expected) => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({ matches })),
    });

    expect(readStoredTheme()).toBeNull();
    expect(systemTheme()).toBe(expected);
  });

  it("falls back when storage access throws", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: () => {
        throw new Error("storage blocked");
      },
    });

    expect(readStoredTheme()).toBeNull();
  });

  it("applies the theme attribute, colour scheme and browser chrome colour", () => {
    applyTheme("light");

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe(
      themeTokens.light["surface-sunk"]
    );
  });
});

describe("inline theme initialisation", () => {
  it.each([
    ["dark", "dark", "dark"],
    ["light", "dark", "light"],
    [null, "dark", "dark"],
    [null, "light", "light"],
  ] as const)("matches the module for stored=%s system=%s", (stored, system, expected) => {
    const result = runInlineScript(stored, system);
    expect(result.theme).toBe(expected);
    expect(result.colorScheme).toBe(expected);
    expect(result.themeColor).toBe(themeTokens[expected]["surface-sunk"]);
  });
});
