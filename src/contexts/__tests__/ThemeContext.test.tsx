import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider, useTheme } from "../ThemeContext";

const Probe = () => {
  const { theme, toggle } = useTheme();
  return (
    <button type="button" onClick={toggle}>
      {theme}
    </button>
  );
};

const mediaListeners: Array<(event: MediaQueryListEvent) => void> = [];
let systemMatches = false;

beforeEach(() => {
  window.localStorage.clear();
  mediaListeners.length = 0;
  systemMatches = false;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      matches: systemMatches,
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

describe("ThemeProvider", () => {
  it("toggles and saves the selected theme", () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );

    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("dark");
    fireEvent.click(button);
    expect(button).toHaveTextContent("light");
    expect(window.localStorage.getItem("theme")).toBe("light");
  });

  it("follows system changes until a choice is saved", async () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );

    systemMatches = true;
    mediaListeners.forEach((listener) => listener({ matches: true } as MediaQueryListEvent));
    await waitFor(() => expect(screen.getByRole("button")).toHaveTextContent("light"));

    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toHaveTextContent("dark");
    systemMatches = true;
    mediaListeners.forEach((listener) => listener({ matches: true } as MediaQueryListEvent));
    expect(screen.getByRole("button")).toHaveTextContent("dark");
  });
});
