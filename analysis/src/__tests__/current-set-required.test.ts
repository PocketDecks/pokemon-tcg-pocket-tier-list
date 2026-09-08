jest.mock("../data/limitless-pairings.json", () => ({
  pairings: {},
}));

// The engine now treats currentSet as required: a pairing store written
// without it is a corrupt input and must fail at module load instead of
// silently falling back to a vote across all sets.
describe("currentSet requirement", () => {
  it("throws a clear error when the pairing store lacks currentSet", async () => {
    await expect(import("../utils/get-deck-name")).rejects.toThrow(
      "pairing store missing required currentSet"
    );
  });
});
