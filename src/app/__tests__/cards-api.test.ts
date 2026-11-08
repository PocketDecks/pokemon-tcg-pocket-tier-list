import { describe, expect, it } from "vitest";
import { RawCardType, normaliseCard, normaliseMultipleCards } from "../cards-api";
import fixture from "../__fixtures__/cards.json";

// Copied from the live v5.1.0 payload: a Pokémon, a Trainer, an ex Pokémon.
const [bulbasaur, erika, venusaurEx] = fixture as RawCardType[];

describe("normaliseCard", () => {
  it("maps set_code to set", () => {
    expect(normaliseCard(bulbasaur).set).toBe("a1");
  });

  it("points type at the elemental type and supertype at the card class", () => {
    const card = normaliseCard(bulbasaur);
    expect(card.type).toBe("Grass");
    expect(card.supertype).toBe("Pokémon");
  });

  it("keeps ex as a boolean", () => {
    expect(normaliseCard(bulbasaur).ex).toBe(false);
    expect(normaliseCard(venusaurEx).ex).toBe(true);
  });

  it("normalises Trainers so they are identifiable by supertype", () => {
    const card = normaliseCard(erika);
    expect(card.supertype).toBe("Trainer");
    expect(card.type).toBe("Supporter");
    expect(card.stage).toBeNull();
    expect(card.health).toBeNull();
  });

  it("carries the remaining fields through untouched", () => {
    expect(normaliseCard(venusaurEx)).toEqual({
      id: "a1-004",
      name: "Venusaur ex",
      rarity: "◊◊◊◊",
      pack: "Mewtwo",
      type: "Grass",
      supertype: "Pokémon",
      health: 190,
      stage: "Stage 2",
      image: venusaurEx.image,
      ex: true,
      set: "a1",
      deckBuilderNr: 4,
    });
  });

  it("normalises every record in a payload", () => {
    expect(normaliseMultipleCards(fixture as RawCardType[])).toHaveLength(fixture.length);
  });

  it("carries deckBuilderNr through from the payload", () => {
    expect(normaliseCard(bulbasaur).deckBuilderNr).toBe(1);
    expect(normaliseCard(erika).deckBuilderNr).toBe(1000011);
    expect(normaliseCard(venusaurEx).deckBuilderNr).toBe(4);
  });

  it("coerces sparse core-payload fields to their old-payload values", () => {
    const coreTrainer: RawCardType = {
      id: "a1-219",
      name: "Erika",
      set_code: "a1",
      pack: "Charizard",
      type: "Trainer",
      subtype: "Supporter",
      rarity: "\u25CA\u25CA",
      image: "https://example.com/a1-219.webp",
      deckBuilderNr: 1000011,
    };
    const card = normaliseCard(coreTrainer);
    expect(card.ex).toBe(false);
    expect(card.health).toBeNull();
    expect(card.stage).toBeNull();
    expect(card.deckBuilderNr).toBe(1000011);
  });
});

describe("filter predicates against normalised cards", () => {
  const cards = normaliseMultipleCards(fixture as RawCardType[]);
  const matchesEnergy = (energy: string) =>
    cards.filter((c) => c.type === energy || c.supertype === "Trainer");
  const withoutEx = () =>
    cards.filter((c) => c.supertype === "Trainer" || !c.ex);

  it("matches Grass Pokémon and lets Trainers through any energy filter", () => {
    expect(matchesEnergy("Grass").map((c) => c.id)).toEqual([
      "a1-001",
      "a1-219",
      "a1-004",
    ]);
    expect(matchesEnergy("Fire").map((c) => c.id)).toEqual(["a1-219"]);
  });

  it("drops ex Pokémon but keeps Trainers when ex is excluded", () => {
    expect(withoutEx().map((c) => c.id)).toEqual(["a1-001", "a1-219"]);
  });
});
