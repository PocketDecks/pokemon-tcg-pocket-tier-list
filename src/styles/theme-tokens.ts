export type ThemeName = "dark" | "light";

export type TokenName =
  | "bg"
  | "surface"
  | "surface-sunk"
  | "text"
  | "border"
  | "s"
  | "a"
  | "b"
  | "c"
  | "d"
  | "f"
  | "focus"
  | "text-muted"
  | "text-subtle"
  | "line"
  | "line-strong"
  | "fill-hover"
  | "fill-active"
  | "shadow"
  | "on-accent"
  | "s-text"
  | "a-text"
  | "f-text"
  | "surface-inverse"
  | "text-inverse"
  | "input-border";

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
