import { cardKey } from "../utils/set-codes";
import { resolveSlug, slugTokens } from "../utils/slug-cards";

const keys = (slug: string): string[] =>
  resolveSlug(slug).map((c) => cardKey(c.name, c.set, c.number));

describe("slugTokens", () => {
  it("splits a two-card slug into name/set pairs", () => {
    expect(slugTokens("miraidon-ex-b3a-magnezone-b1a")).toEqual([
      ["miraidon-ex", "b3a"],
      ["magnezone", "b1a"],
    ]);
  });

  it("emits one token per set code, leaving the hyphen-merge to resolveToken", () => {
    // hydreigon-mega-absol-ex-b1 carries a single set code, so it is one token;
    // resolveToken then splits the name on the hyphen into two cards.
    expect(slugTokens("hydreigon-mega-absol-ex-b1")).toEqual([
      ["hydreigon-mega-absol-ex", "b1"],
    ]);
  });
});

describe("resolveSlug", () => {
  it("resolves a plain two-card slug to its card keys", () => {
    expect(keys("miraidon-ex-b3a-magnezone-b1a")).toEqual([
      "Miraidon ex B3a 19",
      "Magnezone B1a 26",
    ]);
  });

  it("splits a hyphen-merged token into two cards", () => {
    expect(keys("hydreigon-mega-absol-ex-b1")).toEqual([
      "Hydreigon B1 157",
      "Mega Absol ex B1 151",
    ]);
  });

  it("folds reprint-set (A4b) cards onto the earliest earlier printing", () => {
    // A4b is a deluxe reprint set, so its listings must not span an extra row.
    expect(keys("palkia-ex-a4b")).toEqual(["Palkia ex A2 49"]);
  });

  it("expands the rockets spelling to the apostrophe card name", () => {
    expect(keys("team-rockets-mewtwo-ex-b3")).toEqual([
      "Team Rocket's Mewtwo B4a 30",
    ]);
  });

  it("returns an empty array for a slug with no resolvable token", () => {
    expect(resolveSlug("not-a-real-card-z9")).toEqual([]);
  });

  it("resolves a two-card slug with the wanted-set spelling each", () => {
    expect(resolveSlug("gyarados-ex-a1a-greninja-a1").map((c) => c.name)).toEqual([
      "Gyarados ex",
      "Greninja",
    ]);
  });

  it("returns empty for a slug with a leftover numbered suffix", () => {
    // mega-altaria-ex-b1-102 leaves -102 unmatched, so it is incomplete.
    expect(resolveSlug("mega-altaria-ex-b1-102")).toEqual([]);
  });

  it("resolves a two-card promo slug with a p-a suffix", () => {
    expect(resolveSlug("starmie-ex-a1-lapras-ex-p-a").map((c) => c.name)).toEqual([
      "Starmie ex",
      "Lapras ex",
    ]);
  });

  it("returns empty for a slug with an unmatched suffix", () => {
    // slugTokens matches miraidon-ex-b3a then stops at the trailing -zzz,
    // so the input was not fully consumed.
    expect(resolveSlug("miraidon-ex-b3a-zzz")).toEqual([]);
  });

  it("returns empty when one token resolves to no cards", () => {
    // miraidon-ex-b3a resolves, but not-a-real-card-z9 does not, so the
    // partly resolvable slug must read as a failure.
    expect(resolveSlug("miraidon-ex-b3a-not-a-real-card-z9")).toEqual([]);
  });
});
