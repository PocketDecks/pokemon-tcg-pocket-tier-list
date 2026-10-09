import { describe, expect, it } from "vitest";
import expansions from "pokemon-tcg-pocket-cards/data/v5/expansions.json";
import {
  DELUXE_EXPANSION_IDS,
  isListedExpansion,
  newestExpansion,
} from "../expansion-policy.mjs";

type Entry = { id: string; name: string; release_date: string | null };

const fixture: Entry[] = [
  { id: "b4", name: "Ruler of the Skies", release_date: "2026-07-30" },
  { id: "pa", name: "Promo-A", release_date: null },
  { id: "pb", name: "Promo-B", release_date: null },
  { id: "b4a", name: "Team Rocket's Ambition", release_date: "2026-08-27" },
  { id: "b4b", name: "Deluxe Pack: Mega", release_date: "2026-09-30" },
];

describe("expansion policy", () => {
  it("picks the newest dated set that is not a deluxe reprint", () => {
    expect(newestExpansion(fixture)?.id).toBe("b4a");
  });

  it("ignores a promo appended after the newest set", () => {
    const appended = [...fixture, { id: "pc", name: "Promo-C", release_date: null }];
    expect(newestExpansion(appended)?.id).toBe("b4a");
  });

  it("returns null when no set is eligible", () => {
    expect(newestExpansion([fixture[1], fixture[4]])).toBeNull();
  });

  it("keeps promo pools listed and drops deluxe sets", () => {
    expect(fixture.filter(isListedExpansion).map((e) => e.id)).toEqual([
      "b4",
      "pa",
      "pb",
      "b4a",
    ]);
  });

  it("knows every deluxe set in the installed package", () => {
    const deluxe = (expansions as Entry[])
      .filter((e) => e.name.startsWith("Deluxe Pack"))
      .map((e) => e.id);
    expect(deluxe.length).toBeGreaterThan(0);
    for (const id of deluxe) expect(DELUXE_EXPANSION_IDS.has(id)).toBe(true);
  });

  it("names the newest eligible set in the installed package", () => {
    const newest = newestExpansion(expansions as Entry[]);
    expect(newest).not.toBeNull();
    expect(DELUXE_EXPANSION_IDS.has(newest!.id)).toBe(false);
    expect(newest!.release_date).not.toBeNull();
  });
});
