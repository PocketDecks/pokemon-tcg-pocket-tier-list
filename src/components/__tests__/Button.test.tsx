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
    ).toMatch(/::before[^}]*z-index:-1/);
  });
});
