import { describe, expect, it } from "vitest";

import {
  PREMIUM_DECK_SLUGS_FILE,
  buildPremiumDeckSlugs,
  renderPremiumDeckSlugs,
} from "../utils/premium-deck-slugs";

const named = (...names: string[]) => names.map((name) => ({ name }));

describe("buildPremiumDeckSlugs", () => {
  it("is empty when every premium window offers only decks the default window offers", () => {
    const shared = named("a-a1-001", "b-a1-002");

    expect(
      buildPremiumDeckSlugs({ "20d": shared, "30d": shared, all: shared }, "20d", ["30d", "all"])
    ).toEqual({});
  });

  it("lists a deck offered only in a premium window with the windows that offer it", () => {
    const result = buildPremiumDeckSlugs(
      {
        "20d": named("a-a1-001"),
        "30d": named("a-a1-001", "mega-altaria-ex-b1-102&bonsly-b3-078"),
        all: named("a-a1-001", "mega-altaria-ex-b1-102&bonsly-b3-078", "old-a1-009"),
      },
      "20d",
      ["30d", "all"]
    );

    expect(result).toEqual({
      "mega-altaria-ex-b1-102&bonsly-b3-078": ["30d", "all"],
      "old-a1-009": ["all"],
    });
  });

  it("sorts the slugs and keeps the windows in premium order", () => {
    const result = buildPremiumDeckSlugs(
      { "20d": [], "30d": named("zeta-a1-003", "alpha-a1-001"), all: named("alpha-a1-001") },
      "20d",
      ["30d", "all"]
    );

    expect(Object.keys(result)).toEqual(["alpha-a1-001", "zeta-a1-003"]);
    expect(result["alpha-a1-001"]).toEqual(["30d", "all"]);
  });

  it("keys decks by the route slug the site uses", () => {
    const result = buildPremiumDeckSlugs(
      { "20d": [], "30d": named("Nidoran♀-A1-166"), all: [] },
      "20d",
      ["30d", "all"]
    );

    expect(Object.keys(result)).toEqual(["nidoran-f-a1-166"]);
  });

  it("holds names and window ids only", () => {
    const full = { name: "x-a1-001", powerScore: 91, bestList: { cards: ["2:a1-001"] } };
    const result = buildPremiumDeckSlugs({ "20d": [], "30d": [full], all: [] }, "20d", ["30d", "all"]);

    expect(JSON.stringify(result)).toBe('{"x-a1-001":["30d"]}');
  });
});

describe("renderPremiumDeckSlugs", () => {
  it("renders an empty list as an empty object with a trailing newline", () => {
    expect(renderPremiumDeckSlugs({})).toBe("{}\n");
  });

  it("renders sorted keys with two-space indentation and a trailing newline", () => {
    expect(renderPremiumDeckSlugs({ b: ["all"], a: ["30d", "all"] })).toBe(
      '{\n  "a": [\n    "30d",\n    "all"\n  ],\n  "b": [\n    "all"\n  ]\n}\n'
    );
  });

  it("targets the committed frontend data file", () => {
    expect(PREMIUM_DECK_SLUGS_FILE).toBe("../src/data/premium-deck-slugs.json");
  });
});
