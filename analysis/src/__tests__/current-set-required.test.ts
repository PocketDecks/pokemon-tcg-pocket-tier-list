import { pickCurrentSet, readStore } from "../utils/deck-listing-store";

// The store must keep currentSet after a scrape so downstream snapshots know
// the newest standard set; a store with a null currentSet means the newest
// page never came back and must not be silently treated as current.
describe("currentSet in the store", () => {
  it("reads currentSet from a written store", () => {
    const raw = JSON.stringify({ updatedAt: null, currentSet: "B4a", sets: {} });
    expect(readStore(raw).currentSet).toBe("B4a");
  });

  it("adopts the newest standard set once its page is fetched", () => {
    expect(pickCurrentSet(null, "B4a", new Set(["B4a"]))).toBe("B4a");
  });
});
