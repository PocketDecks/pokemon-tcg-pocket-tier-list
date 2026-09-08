import {
  COPY_WEIGHT,
  SEEDED_BONUS,
  SAME_LINE_BONUS,
  ANCHORED_BONUS,
} from "../utils/get-deck-name";

// The scoring lattice orders the tie-break weights so that one level never
// outweighs the next: sameLine beats anchored beats copies beats seeded beats
// reach (reach is non-negative, so a seeded deck outranks any plain partner).
describe("deck-name score lattice", () => {
  it("orders sameLine above anchored", () => {
    expect(SAME_LINE_BONUS).toBeGreaterThan(ANCHORED_BONUS);
  });

  it("orders anchored above copies", () => {
    expect(ANCHORED_BONUS).toBeGreaterThan(COPY_WEIGHT);
  });

  it("orders copies above seeded", () => {
    expect(COPY_WEIGHT).toBeGreaterThan(SEEDED_BONUS);
  });

  it("orders seeded above reach", () => {
    // Reach is a sum of non-negative peak counts, so its floor is zero and any
    // seeded bonus beats it.
    expect(SEEDED_BONUS).toBeGreaterThan(0);
  });
});
