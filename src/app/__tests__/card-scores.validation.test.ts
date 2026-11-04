import { describe, expect, it } from "vitest";
import { parseCardScores } from "../use-cards";

const valid = { name: "2 Copycat B1 225", score: 0.8, popularity: 0.9 };

describe("card score validation", () => {
  it.each([
    ["a null row", null],
    ["a non-string name", { ...valid, name: 25 }],
    ["a two-part name", { ...valid, name: "2 5" }],
    ["an infinite score", { ...valid, score: Infinity }],
    ["infinite popularity", { ...valid, popularity: Infinity }],
    ["negative popularity", { ...valid, popularity: -0.1 }],
    ["an overflow copy count", { ...valid, name: `${"9".repeat(310)} Copycat B1 225` }],
    ["an unsafe integer copy count", { ...valid, name: "9007199254740992 Copycat B1 225" }],
    ["an unknown set", { ...valid, name: "2 Copycat UNKNOWN 225" }],
  ])("rejects %s", (_label, row) => {
    expect(() => parseCardScores([row])).toThrow("Card score payload contains an invalid row");
  });

  it("accepts normal, zero and maximum safe copy counts", () => {
    expect(
      parseCardScores([
        valid,
        { ...valid, name: "0 Copycat B1 225" },
        { ...valid, name: "9007199254740991 Copycat B1 225" },
      ])
    ).toHaveLength(3);
  });
});
