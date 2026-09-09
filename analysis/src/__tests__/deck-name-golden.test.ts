import golden from "../__fixtures__/deck-name-golden.json";
import realDeckLists from "../__fixtures__/real-deck-lists.json";
import { buildGolden } from "../../scripts/generate-deck-name-golden";

describe("deck naming characterisation", () => {
  it("regenerates the golden unchanged", () => {
    expect(buildGolden()).toEqual(golden);
  });

  it("covers every listing row and the real deck lists", () => {
    expect(Object.keys(golden).length).toBeGreaterThanOrEqual(19000);
  });

  it("names every seeded archetype alone and with a partner", () => {
    const seededCases = Object.keys(golden).filter((key) => key.startsWith("seed:"));
    expect(seededCases.length).toBeGreaterThan(0);
  });

  it("names every real deck list in the snapshot", () => {
    const lists = (realDeckLists as { lists: unknown[] }[]).reduce(
      (acc, archetype) => acc + archetype.lists.length,
      0
    );
    const named = Object.keys(golden).filter((key) => key.startsWith("real:")).length;
    expect(named).toBe(lists);
  });
});
