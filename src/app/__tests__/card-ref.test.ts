import { describe, expect, it } from "vitest";
import { parseDeckListRef, parseScoreRef, setCode } from "../card-ref";

describe("parseDeckListRef", () => {
  it("splits a deck-list reference from best-decks.json", () => {
    expect(parseDeckListRef("2:b4-103")).toEqual({
      id: "b4-103",
      count: 2,
      set: "b4",
    });
  });

  it("reads a single copy", () => {
    expect(parseDeckListRef("1:a2-110")).toEqual({
      id: "a2-110",
      count: 1,
      set: "a2",
    });
  });
});

describe("parseScoreRef", () => {
  it("splits a score reference from card-scores.json", () => {
    expect(parseScoreRef("1 Cyrus A2 150")).toEqual({
      id: "a2-150",
      count: 1,
      set: "a2",
    });
  });

  it("keeps a card name that itself contains spaces", () => {
    expect(parseScoreRef("1 Field Blower B3 147")).toEqual({
      id: "b3-147",
      count: 1,
      set: "b3",
    });
  });

  it("pads a short card number", () => {
    expect(parseScoreRef("2 Poké Ball PA 5")).toEqual({
      id: "pa-005",
      count: 2,
      set: "pa",
    });
  });
});

describe("setCode", () => {
  it("strips the hyphen from promo sets", () => {
    expect(setCode("P-A")).toBe("pa");
    expect(setCode("P-B")).toBe("pb");
    expect(setCode("P-C")).toBe("pc");
  });

  it("lowercases everything else", () => {
    expect(setCode("A2")).toBe("a2");
  });
});
