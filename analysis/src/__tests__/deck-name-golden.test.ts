import golden from "../__fixtures__/deck-name-golden.json";
import realDeckLists from "../__fixtures__/real-deck-lists.json";
import { buildGolden } from "../../scripts/generate-deck-name-golden";

// Characterisation test. It asserts nothing about whether a name is *right*,
// only that naming has not moved. Any diff here from a refactor is a
// behaviour change that must be justified, not accepted.
describe("deck naming characterisation", () => {
  it("regenerates the golden unchanged", () => {
    expect(buildGolden()).toEqual(golden);
  });

  it("covers the whole pairing store", () => {
    // Guards against the golden being silently emptied or truncated.
    expect(Object.keys(golden).length).toBeGreaterThan(2000);
  });

  it("names every real deck list in the snapshot", () => {
    const lists = (realDeckLists as { lists: unknown[] }[]).reduce(
      (acc, archetype) => acc + archetype.lists.length,
      0
    );
    const named = Object.keys(golden).filter((key) => key.startsWith("real:")).length;
    // Every snapshot list must appear in the golden: a list that fails to
    // resolve used to be skipped silently, shrinking the golden without failing.
    expect(named).toBe(lists);
  });
});
