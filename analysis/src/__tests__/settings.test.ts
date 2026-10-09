import expansions from "pokemon-tcg-pocket-cards/data/v5/expansions.json";
import { DELUXE_SET_IDS, EXPANSION_RELEASE_DATE, latestReleaseDate } from "../settings";

// The ramp (win-rate weight and the new-set multiplier) is timed from the
// newest expansion. That date is derived from the package, so it has to keep
// agreeing with the package rather than with a constant that drifts.
describe("EXPANSION_RELEASE_DATE", () => {
  const list = expansions as { id: string; release_date: string | null }[];

  it("matches the newest dated non-reprint expansion in the package", () => {
    const expected = [...list]
      .filter((e) => e.release_date && !DELUXE_SET_IDS.has(e.id))
      .map((e) => e.release_date as string)
      .sort()
      .pop();

    expect(expected).toBeDefined();
    expect(EXPANSION_RELEASE_DATE.toISOString().slice(0, 10)).toBe(expected);
  });

  it("is never a promo set, which carries a null date", () => {
    const promos = list.filter((e) => !e.release_date).map((e) => e.id);
    expect(promos).toContain("pa");
    expect(EXPANSION_RELEASE_DATE.getUTCFullYear()).toBeGreaterThan(2020);
  });

  it("does not match a deluxe reprint set", () => {
    for (const id of DELUXE_SET_IDS) {
      const reprint = list.find((e) => e.id === id);
      if (reprint?.release_date) {
        expect(EXPANSION_RELEASE_DATE.toISOString().slice(0, 10)).not.toBe(
          reprint.release_date
        );
      }
    }
  });
});

describe("latestReleaseDate", () => {
  const fixture = [
    { id: "b4", name: "Ruler of the Skies", release_date: "2026-07-30" },
    { id: "pa", name: "Promo-A", release_date: null },
    { id: "b4a", name: "Team Rocket's Ambition", release_date: "2026-08-27" },
    { id: "b4b", name: "Deluxe Pack: Mega", release_date: "2026-09-30" },
    { id: "pc", name: "Promo-C", release_date: null },
  ];

  it("skips deluxe reprints and undated promos", () => {
    expect(latestReleaseDate(fixture).toISOString().slice(0, 10)).toBe("2026-08-27");
  });

  it("resolves a same-date pair to the shared date in either order", () => {
    const sameDate = [
      { id: "b4a", name: "Team Rocket's Ambition", release_date: "2026-09-15" },
      { id: "b4c", name: "Mega Rising", release_date: "2026-09-15" },
    ];
    expect(latestReleaseDate(sameDate).toISOString().slice(0, 10)).toBe("2026-09-15");
    expect(latestReleaseDate([...sameDate].reverse()).toISOString().slice(0, 10)).toBe(
      "2026-09-15"
    );
  });

  it("knows every deluxe set in the installed package", () => {
    const list = expansions as { id: string; name: string }[];
    const deluxe = list.filter((e) => e.name.startsWith("Deluxe Pack")).map((e) => e.id);
    expect(deluxe.length).toBeGreaterThan(0);
    for (const id of deluxe) expect(DELUXE_SET_IDS.has(id)).toBe(true);
  });
});
