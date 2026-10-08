import { describe, expect, it } from "vitest";
import { chartChrome, themeTokens, type ThemeName } from "../theme-tokens";

type Rgb = [number, number, number];

const parseColour = (value: string): { rgb: Rgb; alpha: number } => {
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    return {
      rgb: [0, 2, 4].map((offset) => Number.parseInt(hex[1].slice(offset, offset + 2), 16)) as Rgb,
      alpha: 1,
    };
  }
  const rgba = value.match(/^rgba\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\)$/i);
  if (rgba) return { rgb: [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])], alpha: Number(rgba[4]) };
  throw new Error(`Contrast test cannot parse colour: ${value}`);
};

const composite = (foreground: string, background: string): Rgb => {
  const fg = parseColour(foreground);
  const bg = parseColour(background);
  return fg.rgb.map((channel, index) => channel * fg.alpha + bg.rgb[index] * (1 - fg.alpha)) as Rgb;
};

const luminance = (colour: Rgb): number => {
  const channels = colour.map((channel) => channel / 255);
  const linear = channels.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
};

const contrast = (foreground: string, background: string): number => {
  const foregroundLuminance = luminance(composite(foreground, background));
  const backgroundLuminance = luminance(parseColour(background).rgb);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
};

describe("theme contrast", () => {
  it.each(["dark", "light"] as ThemeName[])('%s meets the text contrast contract', (themeName) => {
    const theme = themeTokens[themeName];
    for (const background of [theme.bg, theme.surface, theme["surface-sunk"]]) {
      expect(contrast(theme.text, background)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme["text-muted"], background)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(theme["text-subtle"], theme.bg)).toBeGreaterThanOrEqual(3);
  });

  it.each(["dark", "light"] as ThemeName[])('%s meets the accent and control contrast contract', (themeName) => {
    const theme = themeTokens[themeName];
    for (const tierText of [theme["s-text"], theme["a-text"], theme["f-text"]]) {
      expect(contrast(tierText, theme.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(tierText, theme.surface)).toBeGreaterThanOrEqual(4.5);
    }
    for (const fill of [theme.s, theme.a, theme.b, theme.c, theme.d, theme.f]) {
      expect(contrast(theme["on-accent"], fill)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(theme.focus, theme.bg)).toBeGreaterThanOrEqual(3);
    expect(contrast(theme.focus, theme.surface)).toBeGreaterThanOrEqual(3);
    expect(contrast(theme["line-strong"], theme.bg)).toBeGreaterThanOrEqual(1.5);
    expect(contrast(theme["input-border"], theme.bg)).toBeGreaterThanOrEqual(3);
  });

  it.each(["dark", "light"] as ThemeName[])('%s meets the energy icon ring contract', (themeName) => {
    const theme = themeTokens[themeName];
    for (const background of [theme.bg, theme.surface]) {
      expect(contrast(theme["energy-ring"], background)).toBeGreaterThanOrEqual(3);
    }
  });

  it.each(["dark", "light"] as ThemeName[])('%s meets the link contrast contract', (themeName) => {
    const theme = themeTokens[themeName];
    for (const background of [theme.bg, theme.surface]) {
      expect(contrast(theme.link, background)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps the light chart tick readable on the page and the tooltip card", () => {
    const theme = themeTokens.light;
    for (const background of ["#FFFFFF", theme.bg, theme.surface]) {
      expect(contrast(chartChrome.light.tick, background)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(["dark", "light"] as ThemeName[])('%s meets the badge chip contrast contract', (themeName) => {
    const theme = themeTokens[themeName];
    for (const ink of [theme["status-up"], theme["status-down"], theme.text]) {
      expect(contrast(ink, theme["badge-bg"])).toBeGreaterThanOrEqual(4.5);
    }
  });
});
