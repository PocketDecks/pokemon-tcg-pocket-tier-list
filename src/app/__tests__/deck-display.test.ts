import { describe, expect, it } from "vitest";
import { deckDisplayName, formatArchetypeId, variantDisplayName } from "../deck-display";
import type { CardType } from "../cards-api";

const icon = (name: string): CardType => ({
  id: name,
  name,
  rarity: "",
  pack: "",
  type: "",
  supertype: "",
  health: null,
  stage: null,
  image: "",
  ex: false,
  set: "",
  deckBuilderNr: null,
});

describe("deckDisplayName", () => {
  it("joins both icons with a slash", () => {
    expect(
      deckDisplayName({
        name: "venusaur-a1-004&bulbasaur-a1-001",
        iconPrimary: icon("Venusaur ex"),
        iconSecondary: icon("Bulbasaur"),
      })
    ).toBe("Venusaur ex / Bulbasaur");
  });

  it("returns just the primary when there is no secondary", () => {
    expect(
      deckDisplayName({
        name: "mega-lucario-ex-b3-081",
        iconPrimary: icon("Lucario ex"),
        iconSecondary: null,
      })
    ).toBe("Lucario ex");
  });

  it("falls back to the formatted archetype id when neither icon resolved", () => {
    expect(deckDisplayName({ name: "mega-lucario-ex-b3-081" })).toBe(
      "Mega Lucario Ex B3 081"
    );
  });
});

describe("formatArchetypeId", () => {
  it("title-cases a hyphenated id", () => {
    expect(formatArchetypeId("mega-lucario-ex-b3-081")).toBe(
      "Mega Lucario Ex B3 081"
    );
  });

  it("keeps the ampersand joining a two-icon archetype", () => {
    expect(formatArchetypeId("baxcalibur-b2a-036&suicune-ex-a4a-020")).toBe(
      "Baxcalibur B2a 036&Suicune Ex A4a 020"
    );
  });
});

describe("variantDisplayName", () => {
  it("drops the set and number from a legacy upper-case archive name", () => {
    expect(variantDisplayName("Mega Altaria ex-B1-102")).toBe("Mega Altaria ex");
  });

  it("joins a legacy two-card name with a slash and puts the ex card first", () => {
    expect(variantDisplayName("Abomasnow-A2a-021&Arceus ex-A2a-071")).toBe(
      "Arceus ex / Abomasnow"
    );
  });

  it("uses the resolved icon names of a live deck", () => {
    expect(
      variantDisplayName("Mega Greninja ex-C1-042&Greninja ex-B1-073", {
        name: "mega-greninja-ex-c1-042&greninja-ex-b1-073",
        iconPrimary: icon("Mega Greninja ex"),
        iconSecondary: icon("Greninja ex"),
      })
    ).toBe("Mega Greninja ex / Greninja ex");
  });
});
