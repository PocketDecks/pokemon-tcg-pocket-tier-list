import { canonSet, cardKey, SET_CODES, SET_CODE_PATTERN, STANDARD_SET_CODES } from "../utils/set-codes";

describe("canonSet", () => {
  it("folds case and promo spellings to the store form", () => {
    expect(canonSet("A1")).toBe("A1");
    expect(canonSet("a1")).toBe("A1");
    expect(canonSet("A2b")).toBe("A2b");
    expect(canonSet("a2b")).toBe("A2b");
    expect(canonSet("A2B")).toBe("A2b");
    expect(canonSet("B4a")).toBe("B4a");
    expect(canonSet("b4a")).toBe("B4a");
    expect(canonSet("PA")).toBe("PA");
    expect(canonSet("pa")).toBe("PA");
    expect(canonSet("P-A")).toBe("PA");
    expect(canonSet("P-B")).toBe("PB");
    expect(canonSet("PB")).toBe("PB");
    expect(canonSet("pb")).toBe("PB");
    // A4b is a real reprint set, kept canonical even though the scraper folds
    // its cards onto an earlier printing.
    expect(canonSet("A4b")).toBe("A4b");
    expect(canonSet("a4b")).toBe("A4b");
    expect(canonSet("B4b")).toBe("B4b");
    expect(canonSet("b4b")).toBe("B4b");
  });
});

describe("cardKey", () => {
  it("builds the pairing key from canonical and raw parts", () => {
    expect(cardKey("Greninja", "A1", "89")).toBe("Greninja A1 89");
    expect(cardKey("Greninja", "a1", "89")).toBe("Greninja A1 89");
    expect(cardKey("Team Rocket's Raticate ex", "b4a", "59")).toBe(
      "Team Rocket's Raticate ex B4a 59"
    );
    expect(cardKey("Lapras ex", "P-A", "14")).toBe("Lapras ex PA 14");
  });
});

describe("SET_CODES is the single enumeration", () => {
  it("keeps the standard sets as a prefix of the full list", () => {
    expect(SET_CODES.slice(0, STANDARD_SET_CODES.length)).toEqual([
      ...STANDARD_SET_CODES,
    ]);
  });

  it("orders the token pattern longest-first so variants win the match", () => {
    const re = new RegExp(`^(?:${SET_CODE_PATTERN})`, "i");
    expect("a1a-something".match(re)?.[0]).toBe("a1a");
    expect("a2b-something".match(re)?.[0]).toBe("a2b");
    expect("p-a-something".match(re)?.[0]).toBe("p-a");
  });
});

describe("canonSet rejects codes outside the enumeration", () => {
  it("throws rather than silently upper-casing an unknown code", () => {
    expect(() => canonSet("Z9")).toThrow("unknown set code");
    expect(() => canonSet("")).toThrow("unknown set code");
  });

  it("still folds every known spelling", () => {
    expect(SET_CODES.length).toBeGreaterThan(0);
    for (const code of SET_CODES) {
      expect(canonSet(code.toLowerCase())).toBe(code);
      expect(canonSet(code.toUpperCase())).toBe(code);
    }
  });
});
