import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ServerStyleSheet } from "styled-components";
import Button from "../Button";
import HomeBanner from "../HomeBanner";

const renderStyles = (children: React.ReactNode) => {
  const sheet = new ServerStyleSheet();
  try {
    renderToString(sheet.collectStyles(children));
    return sheet.getStyleTags();
  } finally {
    sheet.seal();
  }
};

const buttonStyles = () => renderStyles(<Button>View Tier List</Button>);
const bannerStyles = () => renderStyles(<HomeBanner />);

const assertGradient = (styleText: string) => {
  expect(styleText).toMatch(/isolation:isolate/);
  expect(styleText).toMatch(/top:-100%;left:0;width:300%;height:300%;z-index:-1/);
  expect(styleText).toMatch(/transform:translateX\(-66\.667%\)/);
  expect(styleText).not.toContain("background-size:33.333% 100%");
  expect(styleText).not.toContain("z-index:1");
};

describe("gradient text layering", () => {
  it("keeps Button text above its continuous gradient", () => {
    assertGradient(buttonStyles());
  });

  it("keeps HomeBanner text above its continuous gradient", () => {
    assertGradient(bannerStyles());
  });
});
