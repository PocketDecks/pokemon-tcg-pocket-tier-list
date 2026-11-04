import { describe, expect, it } from "vitest";
import expansions from "pokemon-tcg-pocket-cards/data/v5/expansions.min.json";
import decks from "../../../public/data/best-decks.json";
import { expansionIndexPolicy } from "../expansion-index-policy.mjs";

describe("expansion index policy", () => {
  it("indexes the newest covered expansion and its predecessor", () => {
    const list = [
      { id: "a1", name: "Genetic Apex", release_date: "2024-01-01" },
      { id: "b4a", name: "Team Rocket's Ambition", release_date: "2026-08-27" },
      { id: "b4b", name: "Deluxe Pack: Mega", release_date: "2026-09-30" },
      { id: "c1", name: "Dual Fusion", release_date: "2026-10-29" },
    ];
    const covering = [{ lists: [{ cards: ["2:b4a-001", "1:c1-001", "1:b4b-001"] }] }];
    const result = expansionIndexPolicy(list, covering);
    expect(result.newest?.id).toBe("c1");
    expect(result.previous?.id).toBe("b4a");
    expect(result.isIndexable("c1")).toBe(true);
    expect(result.isIndexable("b4a")).toBe(true);
    expect(result.isIndexable("a1")).toBe(false);
    expect(result.isIndexable("b4b")).toBe(false);
  });

  it("returns nothing indexable when no deck covers a listed expansion", () => {
    const result = expansionIndexPolicy(
      [{ id: "c1", name: "Dual Fusion", release_date: "2026-10-29" }],
      [{ lists: [{ cards: ["2:a1-001"] }] }]
    );
    expect(result.newest).toBeNull();
    expect(result.isIndexable("c1")).toBe(false);
  });

  it("pins C1 and B4a as the only indexable expansions in the shipped data", () => {
    const result = expansionIndexPolicy(expansions, decks);
    expect(result.newest?.id).toBe("c1");
    expect(result.previous?.id).toBe("b4a");
    const indexable = expansions.map((expansion) => expansion.id).filter((id) => result.isIndexable(id));
    expect(indexable.sort()).toEqual(["b4a", "c1"]);
  });
});
