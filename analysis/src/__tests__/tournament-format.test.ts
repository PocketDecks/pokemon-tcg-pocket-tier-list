import { isStandardListing, nonStandardReason } from "../utils/tournament-format";

const listing = (format?: string | null) => ({ id: "t1", date: "2026-10-12", format });

const card = (name: string, set: string | null = "A1", number: string | null = "1") => ({
  name,
  set,
  number,
});

describe("isStandardListing", () => {
  it("keeps a listing whose format is null, absent or STANDARD", () => {
    expect(isStandardListing(listing(null) as any)).toBe(true);
    expect(isStandardListing(listing(undefined) as any)).toBe(true);
    expect(isStandardListing(listing("STANDARD") as any)).toBe(true);
  });

  it("drops a listing whose format names another rule set", () => {
    expect(isStandardListing(listing("CUSTOM") as any)).toBe(false);
    expect(isStandardListing(listing("NOEX") as any)).toBe(false);
    expect(isStandardListing(listing("FUTURE") as any)).toBe(false);
  });
});

describe("nonStandardReason", () => {
  it("drops a tournament whose details carry a special rule", () => {
    expect(nonStandardReason({ specialRules: ["MONOTYPE"] })).toBe("special rules MONOTYPE");
  });

  it("drops a tournament that bans a whole set", () => {
    expect(nonStandardReason({ bannedCards: [card("*", "A4", null)] })).toBe("bans set A4");
  });

  it("drops a tournament that bans more named cards than the limit", () => {
    expect(nonStandardReason({ bannedCards: [card("a"), card("b"), card("c")] })).toBe(
      "bans 3 cards"
    );
  });

  it("keeps a tournament that bans exactly the limit of named cards", () => {
    expect(nonStandardReason({ bannedCards: [card("a"), card("b")] })).toBeNull();
  });

  it("keeps a tournament whose only ban records no set or number", () => {
    expect(nonStandardReason({ bannedCards: [card("Cyrus", null, null)] })).toBeNull();
  });

  it("keeps a tournament whose details record no rules and no bans", () => {
    expect(nonStandardReason({})).toBeNull();
    expect(nonStandardReason({ specialRules: [], bannedCards: [] })).toBeNull();
  });

  it("names the tournament when bannedCards is present but not an array", () => {
    expect(() => nonStandardReason({ id: "t1", bannedCards: "x" })).toThrow(
      "Tournament t1: bannedCards response was string, expected an array"
    );
  });

  it("names the tournament when specialRules is present but not an array", () => {
    expect(() => nonStandardReason({ id: "t1", specialRules: "MONOTYPE" })).toThrow(
      "Tournament t1: specialRules response was string, expected an array"
    );
  });
});
