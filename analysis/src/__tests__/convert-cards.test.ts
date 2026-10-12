import { convertCardsToIds } from "../utils/convert-cards";

const card = (count: number, set: string, number: string) => ({
  count,
  name: "Any",
  set,
  number,
});

describe("convertCardsToIds", () => {
  it("writes count, lower-case set and a three-digit number", () => {
    expect(convertCardsToIds([card(2, "A1", "4"), card(1, "B4a", "59")])).toEqual([
      "2:a1-004",
      "1:b4a-059",
    ]);
  });

  it("keeps a number that already has three digits", () => {
    expect(convertCardsToIds([card(2, "A2b", "110")])).toEqual(["2:a2b-110"]);
  });

  it("drops the hyphen from the promo set codes", () => {
    expect(convertCardsToIds([card(2, "P-A", "7"), card(1, "P-B", "12")])).toEqual([
      "2:pa-007",
      "1:pb-012",
    ]);
  });

  it("preserves the order of the cards", () => {
    expect(convertCardsToIds([card(1, "A1", "9"), card(2, "A1", "1")])).toEqual([
      "1:a1-009",
      "2:a1-001",
    ]);
  });

  it("returns an empty list for no cards", () => {
    expect(convertCardsToIds([])).toEqual([]);
  });
});
