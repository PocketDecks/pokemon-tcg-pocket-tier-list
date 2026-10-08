import { describe, expect, it } from "vitest";
import { buildTiers, TIER_COUNT } from "../tier-helper";

const score = (item: { score: number }) => item.score;
const items = (...scores: number[]) => scores.map((s) => ({ score: s }));

const tierOf = (
  tiers: ReturnType<typeof buildTiers>,
  item: { score: number }
): string[] =>
  tiers.filter((tier) => tier.data.includes(item)).map((tier) => tier.label);

describe("buildTiers", () => {
  it("returns nothing for an empty list", () => {
    expect(buildTiers([], score)).toEqual([]);
  });

  it("always returns the six tiers in order", () => {
    expect(buildTiers(items(1, 2, 3), score).map((t) => t.label)).toEqual([
      "S",
      "A",
      "B",
      "C",
      "D",
      "F",
    ]);
  });

  it("builds one tier per TIER_COUNT, which the grid uses to size its rows", () => {
    expect(TIER_COUNT).toBe(6);
    expect(buildTiers(items(1, 2, 3), score)).toHaveLength(TIER_COUNT);
  });

  it("places every item in exactly one tier", () => {
    const scored = items(100, 83, 67, 50, 33, 17, 0, 91, 4, 55, 55, 12);
    const tiers = buildTiers(scored, score);

    for (const item of scored) {
      expect(tierOf(tiers, item)).toHaveLength(1);
    }
    expect(tiers.reduce((n, tier) => n + tier.data.length, 0)).toBe(
      scored.length
    );
  });

  it("puts the best score in S and the worst in F", () => {
    const scored = items(60, 0, 30);
    const tiers = buildTiers(scored, score);

    expect(tierOf(tiers, scored[0])).toEqual(["S"]);
    expect(tierOf(tiers, scored[1])).toEqual(["F"]);
  });

  it("splits an evenly spread range across all six tiers", () => {
    // best 60, worst 0 => steps = 10, so one item per tier band.
    const scored = items(60, 45, 35, 25, 15, 5);
    const tiers = buildTiers(scored, score);

    expect(tiers.map((tier) => tier.data.length)).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it("treats a boundary score as belonging to the higher tier", () => {
    // best 60, worst 0 => steps = 10; 50 sits exactly on the S/A boundary.
    const scored = items(60, 50, 0);
    const tiers = buildTiers(scored, score);

    expect(tierOf(tiers, scored[1])).toEqual(["S"]);
  });

  it("puts everything in S when all scores are equal (steps === 0)", () => {
    const scored = items(7, 7, 7);
    const tiers = buildTiers(scored, score);

    expect(tiers[0].data).toHaveLength(3);
    expect(tiers.slice(1).every((tier) => tier.data.length === 0)).toBe(true);
    for (const item of scored) {
      expect(tierOf(tiers, item)).toEqual(["S"]);
    }
  });

  it("puts a single item in S", () => {
    const scored = items(42);
    expect(buildTiers(scored, score)[0].data).toEqual(scored);
  });
});
