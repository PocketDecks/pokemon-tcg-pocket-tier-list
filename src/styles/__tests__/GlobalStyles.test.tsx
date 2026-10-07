import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { renderToString } from "react-dom/server";
import { ServerStyleSheet } from "styled-components";
import GlobalStyles from "../GlobalStyles";
import { consentTheme } from "../../consent/consent-theme";

const APP_FONT_FAMILY = '"Manrope Variable", "Manrope", "Manrope Fallback", system-ui, -apple-system, "Segoe UI", sans-serif';

const collectCss = () => {
  const sheet = new ServerStyleSheet();
  try {
    renderToString(sheet.collectStyles(<GlobalStyles />));
    return sheet.getStyleTags();
  } finally {
    sheet.seal();
  }
};

describe("GlobalStyles", () => {
  it("ships the declared font stack and loaded Manrope face", () => {
    const css = collectCss();
    const manropeCss = readFileSync(
      require.resolve("@fontsource-variable/manrope/index.css"),
      "utf8"
    );
    const fallback = css.match(/@font-face\{[^}]*font-family:"Manrope Fallback"[^}]*\}/)?.[0];

    expect(fallback).toContain("src:local(\"Arial\")");
    expect(css).toContain("font-family:\"Manrope Variable\",\"Manrope\",\"Manrope Fallback\"");
    expect(manropeCss).toContain("font-family: 'Manrope Variable'");
  });

  it("uses the same app font family in the consent banner", () => {
    const fontFamily = consentTheme.theme?.typography?.fontFamily;

    expect(fontFamily).toBe(APP_FONT_FAMILY);
  });
});
