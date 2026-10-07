import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { ServerStyleSheet } from "styled-components";
import GlobalStyles from "../GlobalStyles";
import { consentTheme } from "../../consent/consent-theme";

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
  it("ships a metric-matched Manrope fallback and uses it in the app stack", () => {
    const css = collectCss();

    expect(css).toContain('@font-face{font-family:"Manrope Fallback"');
    expect(css).toContain('src:local("Arial"),local("ArialMT")');
    expect(css).toContain("size-adjust:103.1851%");
    expect(css).toContain("ascent-override:103.3095%");
    expect(css).toContain("descent-override:29.074%");
    expect(css).toContain("line-gap-override:0%");

    expect(css).toContain(
      'font-family:"Manrope Variable","Manrope","Manrope Fallback",system-ui'
    );
  });

  it("keeps the fallback in the consent banner font stack", () => {
    const fontFamily = consentTheme.theme?.typography?.fontFamily;

    expect(fontFamily).toBe(
      '"Manrope Variable", "Manrope", "Manrope Fallback", system-ui, -apple-system, "Segoe UI", sans-serif'
    );
  });
});
