import { describe, expect, it } from "vitest";
import { expansionIndexPolicy } from "../expansion-index-policy";

describe("expansion index policy", () => {
  it("indexes the newest covered expansion and its predecessor", () => {
    const expansions = [
      { id: "a1", name: "Genetic Apex", release_date: "2024-01-01" },
      { id: "b4a", name: "Team Rocket's Ambition", release_date: "2026-08-27" },
      { id: "b4b", name: "Deluxe Pack: Mega", release_date: "2026-09-30" },
      { id: "c1", name: "Dual Fusion", release_date: "2026-10-29" },
    ];
    const result = expansionIndexPolicy(expansions, new Set(["b4a", "c1"]));
    expect(result.newest?.id).toBe("c1");
    expect(result.previous?.id).toBe("b4a");
    expect(result.isIndexable("c1")).toBe(true);
    expect(result.isIndexable("b4a")).toBe(true);
    expect(result.isIndexable("a1")).toBe(false);
    expect(result.isIndexable("b4b")).toBe(false);
  });
});
