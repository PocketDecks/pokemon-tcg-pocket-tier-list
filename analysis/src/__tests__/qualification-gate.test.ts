import {
  MIN_ARCHETYPE_QUALIFIED_GAMES,
  MIN_WINRATE_THRESHOLD,
} from "../settings";

describe("qualification thresholds", () => {
  it("requires a 0.6 minimum win rate", () => {
    expect(MIN_WINRATE_THRESHOLD).toBe(0.6);
    expect(0.5).toBeLessThan(MIN_WINRATE_THRESHOLD);
    expect(MIN_WINRATE_THRESHOLD).toBeLessThan(1);
  });

  it("requires 25 qualified archetype games", () => {
    expect(MIN_ARCHETYPE_QUALIFIED_GAMES).toBe(25);
  });
});
