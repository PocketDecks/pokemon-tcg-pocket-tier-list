import { describe, expect, it } from "vitest";
import expansions from "pokemon-tcg-pocket-cards/data/v5/expansions.min.json";
import decks from "../../../public/data/best-decks.json";
import { expansionIndexPolicy, MIN_INDEXED_EXPANSION_CARDS } from "../expansion-index-policy.mjs";

const setCards = (set: string, count: number, offset = 0) =>
  Array.from({ length: count }, (_, index) => `1:${set}-${String(index + 1 + offset).padStart(3, "0")}`);

const LIST = [
  { id: "a1", name: "Genetic Apex", release_date: "2024-01-01" },
  { id: "b4a", name: "Team Rocket's Ambition", release_date: "2026-08-27" },
  { id: "b4b", name: "Deluxe Pack: Mega", release_date: "2026-09-30" },
  { id: "c1", name: "Dual Fusion", release_date: "2026-10-29" },
];

describe("expansion index policy", () => {
  it("requires five distinct cards before indexing", () => {
    expect(MIN_INDEXED_EXPANSION_CARDS).toBe(5);
  });

  it("does not index the newest covered expansion with four cards", () => {
    const result = expansionIndexPolicy(LIST, [{ lists: [{ cards: setCards("c1", 4) }] }]);
    expect(result.newest?.id).toBe("c1");
    expect(result.isIndexable("c1")).toBe(false);
  });

  it("indexes the newest covered expansion with five cards", () => {
    const result = expansionIndexPolicy(LIST, [{ lists: [{ cards: setCards("c1", 5) }] }]);
    expect(result.isIndexable("c1")).toBe(true);
  });

  it("counts a card once across lists and decks", () => {
    const repeated = [...setCards("c1", 4), "1:c1-001"];
    const result = expansionIndexPolicy(LIST, [{ lists: [{ cards: repeated }, { cards: ["1:c1-002"] }] }]);
    expect(result.isIndexable("c1")).toBe(false);
  });

  it("indexes the previous covered expansion on its own count when the newest is under the threshold", () => {
    const result = expansionIndexPolicy(LIST, [
      { lists: [{ cards: setCards("c1", 4) }] },
      { lists: [{ cards: setCards("b4a", 6) }] },
    ]);
    expect(result.newest?.id).toBe("c1");
    expect(result.previous?.id).toBe("b4a");
    expect(result.isIndexable("c1")).toBe(false);
    expect(result.isIndexable("b4a")).toBe(true);
  });

  it("never indexes an expansion outside the two newest covered", () => {
    const result = expansionIndexPolicy(LIST, [
      { lists: [{ cards: setCards("a1", 6) }] },
      { lists: [{ cards: setCards("b4a", 6) }] },
      { lists: [{ cards: setCards("c1", 6) }] },
    ]);
    expect(result.isIndexable("a1")).toBe(false);
    expect(result.isIndexable("b4a")).toBe(true);
    expect(result.isIndexable("c1")).toBe(true);
  });

  it("returns nothing indexable when no deck covers a listed expansion", () => {
    const result = expansionIndexPolicy(
      [{ id: "c1", name: "Dual Fusion", release_date: "2026-10-29" }],
      [{ lists: [{ cards: ["2:a1-001"] }] }]
    );
    expect(result.newest).toBeNull();
    expect(result.isIndexable("c1")).toBe(false);
  });

  it("indexes C1 and not B4A in the shipped data", () => {
    const result = expansionIndexPolicy(expansions, decks);
    expect(result.newest?.id).toBe("c1");
    expect(result.previous?.id).toBe("b4a");
    expect(result.isIndexable("c1")).toBe(true);
    expect(result.isIndexable("b4a")).toBe(false);
    const indexable = expansions.map((expansion) => expansion.id).filter((id) => result.isIndexable(id));
    expect(indexable).toEqual(["c1"]);
  });
});
