import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DeckArt from "../DeckArt";

describe("DeckArt", () => {
  it("reserves dimensions for loaded artwork", () => {
    render(<DeckArt size={2.8} src="/card.webp" />);
    const image = screen.getByRole("presentation");
    expect(image).toHaveAttribute("width", "45");
    expect(image).toHaveAttribute("height", "45");
  });
});
