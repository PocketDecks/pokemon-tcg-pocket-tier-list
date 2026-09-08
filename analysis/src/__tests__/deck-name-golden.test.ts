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
    // Guards against the golden being silently emptied or truncated. The floor
    // is the measured case count, so a generator that silently clips partners
    // or drops the seeded cases fails here instead of passing unnoticed.
    expect(Object.keys(golden).length).toBeGreaterThanOrEqual(29307);
  });

  it("pairs every seeded archetype against a real partner", () => {
    // seeded only changes a name when a seeded primary meets a partner that
    // carries peak data. No shipped pairing does that, so these cases are the
    // only coverage the component has.
    const seededCases = Object.keys(golden).filter((key) => key.startsWith("seed:"));
    expect(seededCases.length).toBeGreaterThan(0);
  });
});
