import formatName from "../utils/format-name";

describe("formatName", () => {
  it("should format a single card name correctly", () => {
    expect(formatName(["Pikachu base 58"])).toBe("pikachu-base-058");
  });

  it("should format multiple card names correctly", () => {
    expect(formatName(["Pikachu base 58", "Charizard ex base 12"])).toBe(
      "pikachu-base-058&charizard-ex-base-012"
    );
  });

  it("should handle P-A set code correctly", () => {
    expect(formatName(["Professor's Research PA 7"])).toBe("professor's-research-pa-007");
  });

  it("keeps a three-digit number as it is and pads a one-digit one", () => {
    expect(formatName(["Mewtwo ex A1 129", "Charizard ex A2b 10"])).toBe(
      "mewtwo-ex-a1-129&charizard-ex-a2b-010"
    );
  });

  it("returns an empty slug for no cards", () => {
    expect(formatName([])).toBe("");
  });
});
