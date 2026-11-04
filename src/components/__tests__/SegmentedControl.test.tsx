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

describe("SegmentedControl", () => {
  it("gives each option a 44px minimum target on coarse pointers only", () => {
    renderControl();

    expect(stylesheetText()).toMatch(/@media \(pointer: coarse\)\s*\{[^}]*min-height:\s*4\.4rem/);
  });

  it("applies the hover colour only on hover-capable devices", () => {
    renderControl();

    expect(stylesheetText()).toMatch(/@media \(hover: hover\)\s*\{\s*&?[^{}]*:hover\s*\{/);
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
