import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DeckArt from "../DeckArt";

const REMOTE =
  "https://raw.githubusercontent.com/chase-manning/pokemon-tcg-pocket-cards/refs/heads/main/images/webp/cards/b3/081.webp";

describe("DeckArt", () => {
  it("reserves square dimensions for loaded artwork", () => {
    render(<DeckArt size={2.8} src="/thumbs/b3-081.webp" />);
    const image = screen.getByRole("presentation");
    expect(image).toHaveAttribute("width", "183");
    expect(image).toHaveAttribute("height", "183");
  });

  it("loads the first-party thumbnail for an upstream card image", () => {
    render(<DeckArt size={2.8} src={REMOTE} />);
    expect(screen.getByRole("presentation")).toHaveAttribute(
      "src",
      "/thumbs/b3-081.webp"
    );
  });

  it("falls back to the remote image once when the thumbnail fails", () => {
    render(<DeckArt size={2.8} src={REMOTE} />);
    const image = screen.getByRole("presentation");

    fireEvent.error(image);
    expect(image).toHaveAttribute("src", REMOTE);

    fireEvent.error(image);
    expect(image).toHaveAttribute("src", REMOTE);
  });
});
