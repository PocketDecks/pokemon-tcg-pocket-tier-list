export type ThemeName = "dark" | "light";

const darkTokens = {
  bg: "#1A1A17",
  surface: "#1d1d1b",
  "surface-sunk": "#121210",
  text: "#FFFFFF",
  border: "#000",
  s: "#FF7F7F",
  a: "#FFBF7E",
  b: "#FFDF80",
  c: "#FFFF7F",
  d: "#BFFF7F",
  f: "#7FFF7F",
  focus: "#FFDF80",
  "text-muted": "rgba(255, 255, 255, 0.64)",
  "text-subtle": "rgba(255, 255, 255, 0.4)",
  line: "rgba(255, 255, 255, 0.08)",
  "line-strong": "rgba(255, 255, 255, 0.14)",
  "fill-hover": "rgba(255, 255, 255, 0.06)",
  "fill-active": "rgba(255, 255, 255, 0.12)",
  shadow: "rgba(0, 0, 0, 0.45)",
  "on-accent": "#1A1A17",
  link: "#7FFF7F",
  "s-text": "#FF7F7F",
  "a-text": "#FFBF7E",
  "f-text": "#7FFF7F",
  "surface-inverse": "#1d1d1b",
  "text-inverse": "#FFFFFF",
  "input-border": "#787878",
  "shadow-soft": "rgba(0, 0, 0, 0.1)",
  "shadow-medium": "rgba(0, 0, 0, 0.35)",
  "shadow-strong": "rgba(0, 0, 0, 0.45)",
  "shadow-dark": "rgba(0, 0, 0, 0.7)",
  "shadow-deep": "rgba(0, 0, 0, 0.5)",
  "accent-shadow": "rgba(255, 223, 128, 0.35)",
  "overlay": "rgba(0, 0, 0, 0.6)",
  "transparent-white": "rgba(255, 255, 255, 0)",
  "white-03": "rgba(255, 255, 255, 0.03)",
  "white-035": "rgba(255, 255, 255, 0.035)",
  "white-07": "rgba(255, 255, 255, 0.07)",
  "white-14": "rgba(255, 255, 255, 0.14)",
  "white-16": "rgba(255, 255, 255, 0.16)",
  "white-18": "rgba(255, 255, 255, 0.18)",
  "white-24": "rgba(255, 255, 255, 0.24)",
  "white-28": "rgba(255, 255, 255, 0.28)",
  "white-30": "rgba(255, 255, 255, 0.3)",
  "white-35": "rgba(255, 255, 255, 0.35)",
  "white-36": "rgba(255, 255, 255, 0.36)",
  "white-40": "rgba(255, 255, 255, 0.4)",
  "white-45": "rgba(255, 255, 255, 0.45)",
  "white-50": "rgba(255, 255, 255, 0.5)",
  "white-55": "rgba(255, 255, 255, 0.55)",
  "white-60": "rgba(255, 255, 255, 0.6)",
  "white-66": "rgba(255, 255, 255, 0.66)",
  "white-72": "rgba(255, 255, 255, 0.72)",
  "white-75": "rgba(255, 255, 255, 0.75)",
  "white-78": "rgba(255, 255, 255, 0.78)",
  "white-82": "rgba(255, 255, 255, 0.82)",
  "white-85": "rgba(255, 255, 255, 0.85)",
  "black-72": "rgba(0, 0, 0, 0.72)",
  "black-80": "rgba(0, 0, 0, 0.8)",
  "status-new": "#f2b64c",
  "status-up": "#7ddb8a",
  "status-down": "#e58a8a",
  "status-green": "#4CAF50",
  "status-orange": "#FF9800",
  "status-red": "#F44336",
  "unranked": "#3a3a36",
  "qr-background": "#ffffff",
  "qr-foreground": "#111111",
  "matrix-even": "#383835",
  "matrix-favoured": "#256abf",
  "matrix-unfavoured": "#b8312f",
  "consent-surface-hover": "#26241F",
  "consent-card": "rgba(26, 26, 23, 0.72)",
  "consent-card-border": "rgba(255, 255, 255, 0.12)",
  "consent-button-border": "rgba(255, 255, 255, 0.28)",
  "consent-button-border-hover": "rgba(255, 255, 255, 0.4)",
  "consent-shadow": "rgba(0, 0, 0, 0.45)",
  "consent-muted": "rgba(255, 255, 255, 0.72)",
  "badge-bg": "#141412",
  "black-94": "rgba(18, 18, 16, 0.94)",
  "black-07": "rgba(0, 0, 0, 0.7)",
  "black-01": "rgba(0, 0, 0, 0.1)",
  "black-035": "rgba(0, 0, 0, 0.35)",
  "black-045": "rgba(0, 0, 0, 0.45)",
  "black-05": "rgba(0, 0, 0, 0.5)",
  "black-06": "rgba(0, 0, 0, 0.6)",
  "black-78": "rgba(0, 0, 0, 0.78)",
  "white-01": "rgba(255, 255, 255, 0.1)",
  "white-06": "rgba(255, 255, 255, 0.06)",
  "white-08": "rgba(255, 255, 255, 0.08)",
  "white-10": "rgba(255, 255, 255, 0.1)",
  "white-12": "rgba(255, 255, 255, 0.12)",
  "white-22": "rgba(255, 255, 255, 0.22)",
} satisfies Record<string, string>;

type TokenName = keyof typeof darkTokens;

type TokenValues = Record<TokenName, string>;

const lightTokens: TokenValues = {
  ...darkTokens,
  bg: "#F5F3EE",
  surface: "#FFFFFF",
  "surface-sunk": "#ECE9E2",
  text: "#1A1A17",
  border: "#1A1A17",
  focus: "#A0803A",
  "text-muted": "#5F5B52",
  "text-subtle": "#706B61",
  line: "rgba(26, 26, 23, 0.1)",
  "line-strong": "rgba(26, 26, 23, 0.2)",
  "fill-hover": "rgba(26, 26, 23, 0.05)",
  "fill-active": "rgba(26, 26, 23, 0.09)",
  shadow: "rgba(60, 48, 20, 0.14)",
  link: "#2E7D32",
  "badge-bg": "#FFFFFF",
  "s-text": "#6B1F1F",
  "a-text": "#6A3F00",
  "f-text": "#345000",
  "surface-inverse": "#1A1A17",
  "text-inverse": "#FFFFFF",
  "input-border": "#8A8478",
  "status-new": "#9A5F00",
  "status-up": "#347A40",
  "status-down": "#A23A3A",
  "status-green": "#2E7D32",
  "status-orange": "#B36B00",
  "status-red": "#B3261E",
  unranked: "#6A685F",
  "white-03": "rgba(26, 26, 23, 0.03)",
  "white-035": "rgba(26, 26, 23, 0.035)",
  "white-07": "rgba(26, 26, 23, 0.07)",
  "white-14": "rgba(26, 26, 23, 0.14)",
  "white-16": "rgba(26, 26, 23, 0.16)",
  "white-18": "rgba(26, 26, 23, 0.18)",
  "white-24": "rgba(26, 26, 23, 0.24)",
  "white-28": "rgba(26, 26, 23, 0.28)",
  "white-30": "rgba(26, 26, 23, 0.3)",
  "white-35": "rgba(26, 26, 23, 0.35)",
  "white-36": "rgba(26, 26, 23, 0.36)",
  "white-40": "rgba(26, 26, 23, 0.4)",
  "white-45": "rgba(26, 26, 23, 0.45)",
  "white-50": "rgba(26, 26, 23, 0.5)",
  "white-55": "rgba(26, 26, 23, 0.55)",
  "white-60": "rgba(26, 26, 23, 0.6)",
  "white-66": "rgba(26, 26, 23, 0.66)",
  "white-72": "rgba(26, 26, 23, 0.72)",
  "white-75": "rgba(26, 26, 23, 0.75)",
  "white-78": "rgba(26, 26, 23, 0.78)",
  "white-82": "rgba(26, 26, 23, 0.82)",
  "white-85": "rgba(26, 26, 23, 0.85)",
  "white-01": "rgba(26, 26, 23, 0.1)",
  "white-06": "rgba(26, 26, 23, 0.06)",
  "white-08": "rgba(26, 26, 23, 0.08)",
  "white-10": "rgba(26, 26, 23, 0.1)",
  "white-12": "rgba(26, 26, 23, 0.12)",
  "white-22": "rgba(26, 26, 23, 0.22)",
  "consent-surface-hover": "#E5E1D8",
  "consent-card": "rgba(255, 255, 255, 0.86)",
  "consent-card-border": "rgba(26, 26, 23, 0.18)",
  "consent-button-border": "rgba(26, 26, 23, 0.28)",
  "consent-button-border-hover": "rgba(26, 26, 23, 0.4)",
  "consent-shadow": "rgba(60, 48, 20, 0.14)",
  "consent-muted": "#5F5B52",
};

export const themeTokens: Record<ThemeName, Record<TokenName, string>> = {
  dark: darkTokens,
  light: lightTokens,
};

export type ChartChrome = {
  grid: string;
  tick: string;
  cursor: string;
  dotRing: string;
};

export const chartSeries: Record<ThemeName, readonly string[]> = {
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300"],
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"],
};

export const chartChrome: Record<ThemeName, ChartChrome> = {
  dark: {
    grid: "rgba(255, 255, 255, 0.07)",
    tick: "rgba(255, 255, 255, 0.6)",
    cursor: "rgba(255, 255, 255, 0.24)",
    dotRing: "#121210",
  },
  light: {
    grid: "#E1E0D9",
    tick: "#5F5B52",
    cursor: "#C3C2B7",
    dotRing: "#ECE9E2",
  },
};

export type MatrixScale = {
  even: string;
  favoured: string;
  unfavoured: string;
  frame: string;
  empty: string;
  // The two inks a populated cell switches between. textOnDarkCell carries a
  // saturated cell, textOnLightCell a pale one; the matrix picks by the cell's
  // luminance rather than a fixed white.
  textOnDarkCell: string;
  textOnLightCell: string;
  emptyText: string;
  hover: string;
};

export const matrixScale: Record<ThemeName, MatrixScale> = {
  dark: {
    even: "#383835",
    favoured: "#256abf",
    unfavoured: "#b8312f",
    frame: "#121210",
    empty: "#1d1d1b",
    textOnDarkCell: "var(--text-inverse)",
    textOnLightCell: "var(--on-accent)",
    emptyText: "rgba(255, 255, 255, 0.4)",
    hover: "rgba(255, 255, 255, 0.75)",
  },
  light: {
    even: "#f0efec",
    favoured: "#2a78d6",
    unfavoured: "#e34948",
    frame: "#ECE9E2",
    empty: "#FFFFFF",
    textOnDarkCell: "var(--text-inverse)",
    textOnLightCell: "var(--on-accent)",
    emptyText: "rgba(26, 26, 23, 0.4)",
    hover: "rgba(26, 26, 23, 0.75)",
  },
};

const s2lin = (channel: number): number =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

const lin2s = (channel: number): number => {
  const clamped = Math.max(0, Math.min(1, channel));
  return clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
};

const hexToOklab = (hex: string): [number, number, number] => {
  const value = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4]
    .map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255)
    .map(s2lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
};

const oklabToHex = ([L, a, b]: [number, number, number]): string => {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  const channels = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return (
    "#" +
    channels
      .map((channel) => Math.round(lin2s(channel) * 255).toString(16).padStart(2, "0"))
      .join("")
  );
};

// Mix two hex colours in OKLab and return a concrete hex. This reproduces
// `color-mix(in oklab, ...)` to within a rounding step, and unlike the CSS
// function it yields a value the matrix can measure for its text ink.
export const mixOklab = (from: string, to: string, weight: number): string => {
  const a = hexToOklab(from);
  const b = hexToOklab(to);
  return oklabToHex(a.map((value, index) => value * (1 - weight) + b[index] * weight) as [number, number, number]);
};
