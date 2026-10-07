import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import Tooltip from "../Tooltip";

const renderTooltip = () =>
  render(<Tooltip text="Expected win rate against the field." ariaLabel="Show explanation" />);

describe("Tooltip", () => {
  it("links the explanation to its trigger for assistive technology", () => {
    renderTooltip();
    const trigger = screen.getByRole("button", { name: "Show explanation" });
    const tip = screen.getByText("Expected win rate against the field.");

    expect(tip).toHaveAttribute("role", "tooltip");
    expect(trigger).toHaveAttribute("aria-describedby", tip.id);
  });

  it("opens on click and closes on Escape", () => {
    renderTooltip();
    const trigger = screen.getByRole("button", { name: "Show explanation" });

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("stays open when the page scrolls, so keyboard focus can bring it into view", () => {
    renderTooltip();
    const trigger = screen.getByRole("button", { name: "Show explanation" });

    fireEvent.click(trigger);
    fireEvent.scroll(document);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("closes when the visitor presses outside it", () => {
    renderTooltip();
    const trigger = screen.getByRole("button", { name: "Show explanation" });

    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
});
