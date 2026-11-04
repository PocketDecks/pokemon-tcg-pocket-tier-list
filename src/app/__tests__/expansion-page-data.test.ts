import { describe, expect, it } from "vitest";
import { expansionPageData } from "../expansion-page-data";
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
