import expansions from "pokemon-tcg-pocket-cards/data/v5/expansions.json";
import { EXPANSION_RELEASE_DATE } from "../settings";

// The ramp (win-rate weight and the new-set multiplier) is timed from the
// newest expansion. That date is derived from the package, so it has to keep
// agreeing with the package rather than with a constant that drifts.
describe("EXPANSION_RELEASE_DATE", () => {
  const list = expansions as { id: string; release_date: string | null }[];

  it("matches the newest dated non-reprint expansion in the package", () => {
    const expected = [...list]
      .filter((e) => e.release_date && e.id !== "a4b")
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

  it("does not match an excluded reprint set", () => {
    const a4b = list.find((e) => e.id === "a4b");
    if (a4b?.release_date) {
      expect(EXPANSION_RELEASE_DATE.toISOString().slice(0, 10)).not.toBe(
        a4b.release_date
      );
    }
  });
});
