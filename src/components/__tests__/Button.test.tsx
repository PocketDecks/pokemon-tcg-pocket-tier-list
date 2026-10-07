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

describe("gradient text layering", () => {
  it("keeps plain text above the animated layer", () => {
    expect(
      renderStyles(
        <>
          <Button>View Tier List</Button>
          <HomeBanner />
        </>
      )
    ).toMatch(/isolation:isolate/);
    expect(
      renderStyles(
        <>
          <Button>View Tier List</Button>
          <HomeBanner />
        </>
      )
    ).toMatch(/top:-100%;left:0;width:300%;height:300%;z-index:-1/);
    expect(
      renderStyles(
        <>
          <Button>View Tier List</Button>
          <HomeBanner />
        </>
      )
    ).toMatch(/transform:translateX\(-66\.667%\)/);
    expect(
      renderStyles(
        <>
          <Button>View Tier List</Button>
          <HomeBanner />
        </>
      )
    ).not.toContain("background-size:33.333% 100%");
    expect(
      renderStyles(
        <>
          <Button>View Tier List</Button>
          <HomeBanner />
        </>
      )
    ).not.toContain("z-index:1");
  });
});
