import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DeckArt from "../DeckArt";

const REMOTE =
  "https://raw.githubusercontent.com/chase-manning/pokemon-tcg-pocket-cards/refs/heads/main/images/webp/cards/b3/081.webp";

describe("DeckArt", () => {
  it("reserves square dimensions for loaded artwork", () => {
    render(<DeckArt size={2.8} src="/thumbs/b3-081.webp" />);
    const image = screen.getByRole("presentation");
    expect(image).toHaveAttribute("width", "96");
    expect(image).toHaveAttribute("height", "96");
  });

  it("loads the first-party thumbnail for an upstream card image", () => {
    render(<DeckArt size={2.8} src={REMOTE} />);
    expect(screen.getByRole("presentation")).toHaveAttribute(
      "src",
      "/thumbs/v3/b3-081-96.webp?v=3"
    );
  });

  it("clears responsive sources before selecting the remote fallback", () => {
    render(<DeckArt size={2.8} src={REMOTE} />);
    const image = screen.getByRole("presentation");

    expect(image).toHaveAttribute("srcset");
    expect(image).toHaveAttribute("sizes");
    fireEvent.error(image);

    expect(image).toHaveAttribute("src", REMOTE);
    expect(image).not.toHaveAttribute("srcset");
    expect(image).not.toHaveAttribute("sizes");
  });
});
