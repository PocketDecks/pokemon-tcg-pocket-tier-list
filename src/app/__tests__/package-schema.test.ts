import { describe, expect, it } from "vitest";
import rawCards from "pokemon-tcg-pocket-cards/data/v5/cards.core.min.json";
import rawExpansions from "pokemon-tcg-pocket-cards/data/v5/expansions.min.json";
import { fetchCards } from "../cards-api";
import type { ExpansionType } from "../use-expansions";
import { CARDS_URL, EXPANSIONS_URL } from "../constants";

const expansionById = (id: string): ExpansionType => {
  const expansion = EXPANSIONS_URL.find((entry) => entry.id === id);
  if (!expansion) throw new Error(`Missing expansion ${id}`);
  return expansion;
};

const summariseExpansion = (expansion: ExpansionType) => ({
  id: expansion.id,
  name: expansion.name,
  release_date: expansion.release_date,
  total_cards: expansion.total_cards,
  packs: expansion.packs.map((pack) => ({ id: pack.id, name: pack.name })),
});

describe("frontend card payload", () => {
  it("serves every record from the installed core payload", async () => {
    const { cards } = await fetchCards();
    expect(CARDS_URL).toHaveLength(rawCards.length);
    expect(cards).toHaveLength(rawCards.length);
    expect(cards.map((card) => card.id)).toEqual(rawCards.map((card) => card.id));
    expect(cards.map((card) => card.deckBuilderNr)).toEqual(
      rawCards.map((card) => card.deckBuilderNr)
    );
  });

  it("normalises representative cards to their exact values", async () => {
    const { cards } = await fetchCards();
    const cardById = (id: string) => cards.find((card) => card.id === id);

    expect(cardById("a1-001")).toEqual({
      id: "a1-001",
      name: "Bulbasaur",
      rarity: "◊",
      pack: "Mewtwo",
      type: "Grass",
      supertype: "Pokémon",
      health: 70,
      stage: "Basic",
      image:
        "https://raw.githubusercontent.com/PocketDecks/pokemon-tcg-pocket-cards/refs/heads/main/images/webp/cards/a1/001.webp",
      ex: false,
      set: "a1",
      deckBuilderNr: 1,
    });

    expect(cardById("a1-004")).toEqual({
      id: "a1-004",
      name: "Venusaur ex",
      rarity: "◊◊◊◊",
      pack: "Mewtwo",
      type: "Grass",
      supertype: "Pokémon",
      health: 190,
      stage: "Stage 2",
      image:
        "https://raw.githubusercontent.com/PocketDecks/pokemon-tcg-pocket-cards/refs/heads/main/images/webp/cards/a1/004.webp",
      ex: true,
      set: "a1",
      deckBuilderNr: 4,
    });

    expect(cardById("a1-219")).toEqual({
      id: "a1-219",
      name: "Erika",
      rarity: "◊◊",
      pack: "Charizard",
      type: "Supporter",
      supertype: "Trainer",
      health: null,
      stage: null,
      image:
        "https://raw.githubusercontent.com/PocketDecks/pokemon-tcg-pocket-cards/refs/heads/main/images/webp/cards/a1/219.webp",
      ex: false,
      set: "a1",
      deckBuilderNr: 1000011,
    });

    expect(cardById("pc-013")).toEqual({
      id: "pc-013",
      name: "Mega Dragonite ex",
      rarity: "Promo",
      pack: "Promo-C",
      type: "Dragon",
      supertype: "Pokémon",
      health: 240,
      stage: "Stage 2",
      image:
        "https://raw.githubusercontent.com/PocketDecks/pokemon-tcg-pocket-cards/refs/heads/main/images/webp/cards/pc/013.webp",
      ex: true,
      set: "pc",
      deckBuilderNr: 2277,
    });
  });
});

describe("frontend expansion payload", () => {
  it("exposes every expansion record from the installed payload", () => {
    expect(EXPANSIONS_URL).toHaveLength(rawExpansions.length);
    expect(EXPANSIONS_URL.map((expansion) => expansion.id)).toEqual(
      rawExpansions.map((expansion) => expansion.id)
    );
  });

  it("keeps every expansion's full pack list", () => {
    expect(EXPANSIONS_URL.map((expansion) => expansion.packs.map((pack) => pack.id))).toEqual(
      rawExpansions.map((expansion) => expansion.packs.map((pack) => pack.id))
    );
  });

  it("keeps representative expansions and their packs exact", () => {
    expect(summariseExpansion(expansionById("a1"))).toEqual({
      id: "a1",
      name: "Genetic Apex",
      release_date: "2024-10-30",
      total_cards: 286,
      packs: [
        { id: "a1-charizard", name: "Charizard" },
        { id: "a1-mewtwo", name: "Mewtwo" },
        { id: "a1-pikachu", name: "Pikachu" },
      ],
    });

    expect(summariseExpansion(expansionById("b1"))).toEqual({
      id: "b1",
      name: "Mega Rising",
      release_date: "2025-10-30",
      total_cards: 331,
      packs: [
        { id: "b1-megaaltaria", name: "Mega Altaria" },
        { id: "b1-megablaziken", name: "Mega Blaziken" },
        { id: "b1-megagyarados", name: "Mega Gyarados" },
      ],
    });

    expect(summariseExpansion(expansionById("pc"))).toEqual({
      id: "pc",
      name: "Promo-C",
      release_date: null,
      total_cards: 13,
      packs: [{ id: "pc-booster", name: "Booster" }],
    });
  });
});
