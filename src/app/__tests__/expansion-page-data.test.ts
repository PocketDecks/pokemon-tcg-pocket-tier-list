import { describe, expect, it } from "vitest";
import { expansionPageData, packNameForSlug, packSlug } from "../expansion-page-data";
import { coveredCardIdsBySet } from "../expansion-feed.mjs";
import type { FullDeckType } from "../deck-types";

const card = (id: string, name: string, set = "c1") => ({
  id,
  name,
  rarity: "Common",
  pack: "Test",
  type: "Pokemon",
  supertype: "Pokemon",
  health: 100,
  stage: "Basic",
  image: `/cards/${id}.png`,
  ex: false,
  set,
  deckBuilderNr: 1,
});

const rawDeck = (name: string, lists: { score: number; cards: string[] }[]) => ({ name, lists });

const resolvedDeck = (name: string, iconName: string) =>
  ({
    id: name,
    name,
    iconPrimary: card(`${name}-icon`, iconName),
    iconSecondary: null,
  }) as unknown as FullDeckType;

const C1 = { id: "c1", name: "Dual Fusion", release_date: "2026-10-29", packs: [] };

describe("expansion page data", () => {
  it("keeps used cards in set-number order and decks sorted by display name", () => {
    const cards = [card("c1-010", "Tenth"), card("c1-002", "Second"), card("c1-001", "First")];
    const raw = [
      rawDeck("zeta-c1-010", [{ score: 1, cards: ["2:c1-010", "2:c1-002"] }]),
      rawDeck("alpha-c1-001", [{ score: 1, cards: ["2:c1-001"] }]),
    ];
    const resolved = [resolvedDeck("zeta-c1-010", "Zeta"), resolvedDeck("alpha-c1-001", "Alpha")];
    const result = expansionPageData(C1, cards, raw, resolved);
    expect(result.cards.map((value) => value.id)).toEqual(["c1-001", "c1-002", "c1-010"]);
    expect(result.decks.map((value) => value.displayName)).toEqual(["Alpha", "Zeta"]);
  });

  it("counts a raw best-list card even when the client dropped that deck", () => {
    const cards = [card("c1-001", "First"), card("c1-002", "Second")];
    const raw = [rawDeck("gone-c1-001", [{ score: 1, cards: ["2:c1-001", "2:c1-002"] }])];
    const result = expansionPageData(C1, cards, raw, []);
    expect(result.decks.map((value) => value.name)).toEqual(["gone-c1-001"]);
    expect(result.decks[0].deck).toBeNull();
    expect(result.decks[0].hub).toBe("gone");
    expect(result.cards.map((value) => value.id)).toEqual(["c1-001", "c1-002"]);
    expect(result.cards.length).toBe(coveredCardIdsBySet(raw).get("c1")?.size);
  });

  it("ignores a set card that sits only in a non-best raw list", () => {
    const cards = [card("c1-001", "First"), card("b4a-001", "Other", "b4a")];
    const raw = [
      rawDeck("alpha-b4a-001", [
        { score: 1, cards: ["1:b4a-001"] },
        { score: 0.2, cards: ["1:c1-001"] },
      ]),
    ];
    const result = expansionPageData(C1, cards, raw, []);
    expect(result.decks).toEqual([]);
    expect(result.cards).toEqual([]);
  });
});

describe("expansion page pack filter", () => {
  const A1 = {
    id: "a1",
    name: "Genetic Apex",
    release_date: null,
    packs: [
      { id: "a1-charizard", name: "Charizard", image: null },
      { id: "a1-mewtwo", name: "Mewtwo", image: null },
    ],
  };
  const inPack = (id: string, name: string, pack: string) => ({ ...card(id, name, "a1"), pack });
  const cards = [
    inPack("a1-089", "Greninja", "Charizard"),
    inPack("a1-050", "Mewtwo Card", "Mewtwo"),
    inPack("a1-200", "Shared Card", "Shared(Genetic Apex)"),
  ];
  const raw = [
    rawDeck("greninja-deck", [{ score: 1, cards: ["2:a1-089"] }]),
    rawDeck("mewtwo-deck", [{ score: 1, cards: ["2:a1-050"] }]),
    rawDeck("shared-deck", [{ score: 1, cards: ["2:a1-200"] }]),
  ];

  it("keeps only the chosen pack's cards and shared cards, and shrinks the deck list to match", () => {
    const result = expansionPageData(A1, cards, raw, [], "Mewtwo");
    expect(result.cards.map((value) => value.id)).toEqual(["a1-050", "a1-200"]);
    expect(result.decks.map((value) => value.name)).toEqual(["mewtwo-deck", "shared-deck"]);
  });

  it("shows the full set when the pack name is unknown", () => {
    const result = expansionPageData(A1, cards, raw, [], "Pikachu");
    expect(result.cards.map((value) => value.id)).toEqual(["a1-050", "a1-089", "a1-200"]);
    expect(result.decks.map((value) => value.name)).toEqual(["greninja-deck", "mewtwo-deck", "shared-deck"]);
  });

  it("shows the full set for a single-pack expansion", () => {
    const single = { ...A1, packs: [{ id: "a1-charizard", name: "Charizard", image: null }] };
    const result = expansionPageData(single, cards, raw, [], "Charizard");
    expect(result.cards.length).toBe(3);
  });

  it("maps a pack id to its URL slug and back to the pack name", () => {
    expect(packSlug("a1", "a1-mewtwo")).toBe("mewtwo");
    expect(packNameForSlug(A1, "mewtwo")).toBe("Mewtwo");
    expect(packNameForSlug(A1, "pikachu")).toBeNull();
    expect(packNameForSlug(A1, null)).toBeNull();
  });
});
