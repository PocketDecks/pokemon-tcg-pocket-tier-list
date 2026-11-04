import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ExpansionStack from "../ExpansionStack";

const sources = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("img"), (image) => image.getAttribute("src"));

describe("ExpansionStack", () => {
  it("places the first pack in front and at most two packs behind it", () => {
    const { container } = render(
      <ExpansionStack images={["a.webp", "b.webp", "c.webp", "d.webp"]} />
    );

    expect(sources(container)).toEqual(["c.webp", "b.webp", "a.webp"]);
  });

  it("stacks a two-pack expansion with one pack behind the front", () => {
    const { container } = render(<ExpansionStack images={["a.webp", "b.webp"]} />);

    expect(sources(container)).toEqual(["b.webp", "a.webp"]);
  });

  it("gives every image empty alt text because the link carries the name", () => {
    const { container } = render(
      <ExpansionStack images={["a.webp", "b.webp", "c.webp"]} />
    );

    const alts = Array.from(container.querySelectorAll("img"), (image) => image.getAttribute("alt"));
    expect(alts).toEqual(["", "", ""]);
  });

  it("loads every layer lazily and decodes it asynchronously", () => {
    const { container } = render(
      <ExpansionStack images={["a.webp", "b.webp", "c.webp"]} />
    );

    const images = Array.from(container.querySelectorAll("img"));
    expect(images).toHaveLength(3);
    for (const image of images) {
      expect(image).toHaveAttribute("loading", "lazy");
      expect(image).toHaveAttribute("decoding", "async");
    }
  });
});
