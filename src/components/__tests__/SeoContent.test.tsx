import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SeoContent from "../SeoContent";

const generatedCss = (): string =>
  [...document.querySelectorAll("style")].map((style) => style.textContent ?? "").join("\n");

describe("SeoContent", () => {
  it("styles its links with the theme link colour", () => {
    const { container } = render(
      <SeoContent>
        <a href="/guide">Guide</a>
      </SeoContent>
    );
    const classes = [...(container.querySelector("section")?.classList ?? [])];
    const css = generatedCss();

    expect(
      classes.some((name) => new RegExp(`\\.${name}\\s+a\\s*\\{[^}]*color:\\s*var\\(--link\\)`).test(css))
    ).toBe(true);
  });
});
