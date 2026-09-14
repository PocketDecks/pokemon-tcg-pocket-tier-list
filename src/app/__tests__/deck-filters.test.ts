import { describe, expect, it } from "vitest";
import {
  CardsMapping,
  cardToCount,
  cardToId,
  deckNameToIconIds,
  findUnresolvedCardIds,
  hasEnoughLatestExpansionCards,
  isAffordable,
  matchesEnergy,
  matchesExFilter,
} from "../deck-filters";
import { RawCardType, normaliseMultipleCards } from "../cards-api";
import rawCards from "../__fixtures__/cards.json";

// a1-001 Bulbasaur (Grass, not ex), a1-219 Erika (Trainer),
// a1-004 Venusaur ex (Grass, ex).
const cardsMapping: CardsMapping = normaliseMultipleCards(
  rawCards as RawCardType[]
).reduce((acc: CardsMapping, card) => {
  acc[card.id] = card;
  return acc;
}, {});

describe("card string parsing", () => {
  it("splits count from id", () => {
    expect(cardToId("2:a1-001")).toBe("a1-001");
    expect(cardToCount("2:a1-001")).toBe(2);
  });
});

describe("deckNameToIconIds", () => {
  it("takes the trailing id of a single-Pokémon deck name", () => {
    expect(deckNameToIconIds("bulbasaur-a1-001")).toEqual(["a1-001"]);
  });

  it("takes one id per side of a double deck name", () => {
    expect(deckNameToIconIds("venusaur-a1-004&bulbasaur-a1-001")).toEqual([
      "a1-004",
      "a1-001",
    ]);
  });

  it("takes the trailing ids of real mega-lucario deck names", () => {
    expect(deckNameToIconIds("mega-lucario-ex-b3-081&lucario-a2-092")).toEqual([
      "b3-081",
      "a2-092",
    ]);
  });

  it("takes the trailing id of a real mega-venusaur deck name", () => {
    expect(deckNameToIconIds("mega-venusaur-ex-b1a-004")).toEqual(["b1a-004"]);
  });
});

describe("findUnresolvedCardIds", () => {
  it("returns nothing when every card is in the mapping", () => {
    expect(
      findUnresolvedCardIds(["2:a1-001", "1:a1-219"], cardsMapping)
    ).toEqual([]);
  });

  it("returns the ids missing from the card data", () => {
    expect(
      findUnresolvedCardIds(["2:a1-999", "1:a1-219"], cardsMapping)
    ).toEqual(["a1-999"]);
  });
});

describe("isAffordable", () => {
  it("allows a list when the user is missing nothing", () => {
    expect(isAffordable(["2:a1-001"], {})).toBe(true);
  });

  it("rejects two copies when one is missing, but allows one", () => {
    expect(isAffordable(["2:a1-001"], { "a1-001": 1 })).toBe(false);
    expect(isAffordable(["1:a1-001"], { "a1-001": 1 })).toBe(true);
  });

  it("rejects a list when both copies are missing", () => {
    expect(isAffordable(["1:a1-001"], { "a1-001": 2 })).toBe(false);
  });
});

describe("matchesEnergy", () => {
  it("passes everything through when no energy is selected", () => {
    expect(matchesEnergy(["2:a1-004"], cardsMapping, null)).toBe(true);
  });

  it("matches a list of the selected energy", () => {
    expect(matchesEnergy(["2:a1-001"], cardsMapping, "Grass")).toBe(true);
  });

  it("rejects a list of another energy", () => {
    expect(matchesEnergy(["2:a1-001"], cardsMapping, "Fire")).toBe(false);
  });

  it("lets Trainers through any energy filter", () => {
    expect(matchesEnergy(["1:a1-219"], cardsMapping, "Fire")).toBe(true);
    expect(
      matchesEnergy(["2:a1-001", "1:a1-219"], cardsMapping, "Grass")
    ).toBe(true);
  });
});

describe("matchesExFilter", () => {
  it("passes everything through when ex cards are included", () => {
    expect(matchesExFilter(["2:a1-004"], cardsMapping, true)).toBe(true);
  });

  it("rejects a list containing an ex card when they are excluded", () => {
    expect(matchesExFilter(["2:a1-004"], cardsMapping, false)).toBe(false);
  });

  it("keeps a list of non-ex Pokémon and Trainers", () => {
    expect(
      matchesExFilter(["2:a1-001", "1:a1-219"], cardsMapping, false)
    ).toBe(true);
  });
});

describe("hasEnoughLatestExpansionCards", () => {
  const cards = ["2:a1-001", "1:a1-219"];

  it("passes when no minimum is set", () => {
    expect(hasEnoughLatestExpansionCards(cards, cardsMapping, "a1", null)).toBe(
      true
    );
  });

  it("passes when the latest expansion is unknown", () => {
    expect(hasEnoughLatestExpansionCards(cards, cardsMapping, null, 3)).toBe(
      true
    );
  });

  it("counts copies, not distinct cards", () => {
    expect(hasEnoughLatestExpansionCards(cards, cardsMapping, "a1", 3)).toBe(
      true
    );
    expect(hasEnoughLatestExpansionCards(cards, cardsMapping, "a1", 4)).toBe(
      false
    );
  });

  it("counts nothing from a different expansion", () => {
    expect(hasEnoughLatestExpansionCards(cards, cardsMapping, "b4", 1)).toBe(
      false
    );
  });
});
