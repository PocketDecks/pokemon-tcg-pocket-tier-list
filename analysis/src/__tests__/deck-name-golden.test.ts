import golden from "../__fixtures__/deck-name-golden.json";
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
    expect(Object.keys(golden).length).toBeGreaterThanOrEqual(29262);
  });
});
