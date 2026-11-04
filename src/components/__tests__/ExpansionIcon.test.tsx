import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ExpansionIcon from "../ExpansionIcon";

describe("ExpansionIcon", () => {
  it("loads its pack image lazily and decodes it asynchronously", () => {
    const { container } = render(<ExpansionIcon image="a.webp" alt="" />);

    const image = container.querySelector("img");
    expect(image).toHaveAttribute("loading", "lazy");
    expect(image).toHaveAttribute("decoding", "async");
  });
});
