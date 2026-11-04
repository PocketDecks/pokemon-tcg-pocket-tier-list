import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => (key === "a11y.premiumOnly" ? "(Premium)" : key) }),
}));

import SegmentedControl from "../SegmentedControl";

const renderControl = () =>
  render(
    <SegmentedControl
      label="Rank by"
      options={[
        { value: "a", label: "Alpha" },
        { value: "b", label: "Beta" },
      ]}
      value="a"
      onChange={() => {}}
    />
  );

const stylesheetText = () =>
  Array.from(document.querySelectorAll("style"), (style) => style.textContent ?? "").join("\n");

const mediaBlock = (css: string, query: string) => {
  const start = css.indexOf(query);
  if (start < 0) return "";
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    if (css[index] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, index);
    }
  }
  return "";
};

const optionClass = (button: HTMLElement, css: string) =>
  Array.from(button.classList).find(
    (name) => !name.startsWith("sc-") && new RegExp(`\\.${name}(?![\\w-])`).test(css)
  ) ?? "";

describe("SegmentedControl", () => {
  it("gives each option button a 44px minimum target on coarse pointers only", () => {
    renderControl();
    const css = stylesheetText();
    const className = optionClass(screen.getByRole("button", { name: "Alpha" }), css);

    expect(className).not.toBe("");
    expect(mediaBlock(css, "@media (pointer: coarse)")).toMatch(
      new RegExp(`\\.${className}\\s*\\{[^}]*min-height:\\s*4\\.4rem`)
    );
  });

  it("applies the option button's hover colour only on hover-capable devices", () => {
    renderControl();
    const css = stylesheetText();
    const className = optionClass(screen.getByRole("button", { name: "Alpha" }), css);

    expect(className).not.toBe("");
    expect(mediaBlock(css, "@media (hover: hover)")).toMatch(new RegExp(`\\.${className}:hover\\s*\\{`));
  });

  it("tells screen readers that a locked option needs Premium", () => {
    render(
      <SegmentedControl
        label="Window"
        options={[
          { value: "a", label: "Alpha" },
          { value: "b", label: "Beta", locked: true },
        ]}
        value="a"
        onChange={() => {}}
      />
    );

    expect(screen.getByRole("button", { name: "Beta (Premium)" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Alpha" })).not.toHaveAttribute("aria-disabled");
  });
});
