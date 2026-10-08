export type ThemeName = "dark" | "light";

export type TokenName = string;

const darkTokens: Record<TokenName, string> = {
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
  "line-strong": "rgba(255, 255, 255, 0.12)",
  "fill-hover": "rgba(255, 255, 255, 0.06)",
  "fill-active": "rgba(255, 255, 255, 0.12)",
  shadow: "rgba(0, 0, 0, 0.45)",
  "on-accent": "#1A1A17",
  "s-text": "#FF7F7F",
  "a-text": "#FFBF7E",
  "f-text": "#7FFF7F",
  "surface-inverse": "#1d1d1b",
  "text-inverse": "#FFFFFF",
  "input-border": "rgba(255, 255, 255, 0.22)",
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
  "black-10": "rgba(10, 10, 9, 0.78)",
  "black-18": "rgba(18, 18, 16, 0.82)",
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
};

export const themeTokens: Record<ThemeName, Record<TokenName, string>> = {
  dark: darkTokens,
  light: { ...darkTokens },
};

export type ChartChrome = {
  grid: string;
  tick: string;
  cursor: string;
  dotRing: string;
};

export const chartSeries: Record<ThemeName, readonly string[]> = {
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300"],
  light: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300"],
};

export const chartChrome: Record<ThemeName, ChartChrome> = {
  dark: {
    grid: "rgba(255, 255, 255, 0.07)",
    tick: "rgba(255, 255, 255, 0.6)",
    cursor: "rgba(255, 255, 255, 0.24)",
    dotRing: "#121210",
  },
  light: {
    grid: "rgba(255, 255, 255, 0.07)",
    tick: "rgba(255, 255, 255, 0.6)",
    cursor: "rgba(255, 255, 255, 0.24)",
    dotRing: "#121210",
  },
};

export type MatrixScale = {
  even: string;
  favoured: string;
  unfavoured: string;
  frame: string;
  empty: string;
  populatedText: string;
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
    populatedText: "#fff",
    emptyText: "rgba(255, 255, 255, 0.4)",
    hover: "rgba(255, 255, 255, 0.75)",
  },
  light: {
    even: "#383835",
    favoured: "#256abf",
    unfavoured: "#b8312f",
    frame: "#121210",
    empty: "#1d1d1b",
    populatedText: "#fff",
    emptyText: "rgba(255, 255, 255, 0.4)",
    hover: "rgba(255, 255, 255, 0.75)",
  },
};
