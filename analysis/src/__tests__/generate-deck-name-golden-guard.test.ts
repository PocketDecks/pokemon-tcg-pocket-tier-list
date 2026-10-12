import { vi } from "vitest";
import { generate } from "../../scripts/generate-deck-name-golden";

describe("generate", () => {
  it("writes nothing when a real deck list failed to resolve", () => {
    const write = vi.fn();
    expect(() => generate(write, { decks: [], skipped: 2 })).toThrow(
      "2 real deck lists failed to resolve"
    );
    expect(write).not.toHaveBeenCalled();
  });

  it("writes the golden when every real deck list resolved", () => {
    const write = vi.fn();
    generate(write, { decks: [], skipped: 0 });
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0].endsWith("}\n")).toBe(true);
  });
});
