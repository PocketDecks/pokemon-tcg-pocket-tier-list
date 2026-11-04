import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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

describe("SegmentedControl", () => {
  it("gives each option a 44px minimum target on coarse pointers only", () => {
    renderControl();

    expect(stylesheetText()).toMatch(/@media \(pointer: coarse\)\s*\{[^}]*min-height:\s*4\.4rem/);
  });

  it("applies the hover colour only on hover-capable devices", () => {
    renderControl();

    expect(stylesheetText()).toMatch(/@media \(hover: hover\)\s*\{\s*&?[^{}]*:hover\s*\{/);
  });
});
