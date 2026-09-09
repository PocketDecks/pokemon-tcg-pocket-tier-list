import {
  DeckListingStore,
  mergeSetPage,
  pickCurrentSet,
  readStore,
  snapshot,
} from "../utils/deck-listing-store";

const emptyStore = (): DeckListingStore => ({
  updatedAt: null,
  currentSet: null,
  sets: {},
});

const listing = (name: string, slug: string, count: number) => ({
  name,
  slug,
  count,
});

describe("mergeSetPage", () => {
  it("replaces the set's decks array with the fresh page", () => {
    const store = emptyStore();
    mergeSetPage(store, "A1", [listing("Pikachu ex", "pikachu-ex-a1", 100)]);
    mergeSetPage(store, "A1", [
      listing("Charizard ex", "charizard-ex-a1", 200),
    ]);
    expect(store.sets.A1.decks).toEqual([
      { name: "Charizard ex", slug: "charizard-ex-a1", count: 200 },
    ]);
  });

  it("leaves other sets untouched when replacing one", () => {
    const store = emptyStore();
    mergeSetPage(store, "A1", [listing("Pikachu ex", "pikachu-ex-a1", 100)]);
    mergeSetPage(store, "B3a", [listing("Magnezone Miraidon", "magnezone-miraidon-ex-b3a", 567)]);
    mergeSetPage(store, "A1", [listing("Charizard ex", "charizard-ex-a1", 200)]);
    expect(store.sets.B3a.decks).toEqual([
      { name: "Magnezone Miraidon", slug: "magnezone-miraidon-ex-b3a", count: 567 },
    ]);
  });
});

describe("snapshot", () => {
  it("is stable when no set page moved", () => {
    const store = emptyStore();
    mergeSetPage(store, "A1", [listing("Pikachu ex", "pikachu-ex-a1", 100)]);
    const before = snapshot(store);
    // Replacing with an identical page is a no-op at content level.
    mergeSetPage(store, "A1", [listing("Pikachu ex", "pikachu-ex-a1", 100)]);
    expect(snapshot(store)).toBe(before);
  });

  it("moves when a set's decks change", () => {
    const store = emptyStore();
    mergeSetPage(store, "A1", [listing("Pikachu ex", "pikachu-ex-a1", 100)]);
    const before = snapshot(store);
    mergeSetPage(store, "A1", [listing("Charizard ex", "charizard-ex-a1", 200)]);
    expect(snapshot(store)).not.toBe(before);
  });

  it("ignores updatedAt, which moves on every run by definition", () => {
    const store = emptyStore();
    mergeSetPage(store, "A1", [listing("Pikachu ex", "pikachu-ex-a1", 100)]);
    const before = snapshot(store);
    store.updatedAt = new Date().toISOString();
    expect(snapshot(store)).toBe(before);
  });
});

describe("readStore", () => {
  it("returns an empty store for missing input", () => {
    const store = readStore(null);
    expect(store).toEqual({ updatedAt: null, currentSet: null, sets: {} });
  });

  it("preserves currentSet from a written store", () => {
    const raw = JSON.stringify({ updatedAt: "2026-09-09T00:00:00.000Z", currentSet: "B4a", sets: {} });
    expect(readStore(raw).currentSet).toBe("B4a");
  });
});

describe("pickCurrentSet", () => {
  it("adopts the newest set when its page was fetched", () => {
    expect(pickCurrentSet("B4", "B4a", new Set(["B4", "B4a"]))).toBe("B4a");
  });

  it("is a no-op when the newest set is already current", () => {
    expect(pickCurrentSet("B4a", "B4a", new Set(["B4", "B4a"]))).toBe("B4a");
  });

  it("does NOT regress to an older set when the newest page failed", () => {
    // A single timeout on the B4a page used to rewrite currentSet to B4, which
    // silently renames the whole tier list, then flips back next week.
    expect(pickCurrentSet("B4a", "B4a", new Set(["B4"]))).toBe("B4a");
  });

  it("leaves currentSet alone when nothing was fetched at all", () => {
    expect(pickCurrentSet("B4a", "B4a", new Set())).toBe("B4a");
  });

  it("adopts the newest set on a first run when its page was fetched", () => {
    expect(pickCurrentSet(null, "B4a", new Set(["B4a"]))).toBe("B4a");
  });

  it("stays null on a first run whose newest page failed", () => {
    expect(pickCurrentSet(null, "B4a", new Set(["B4"]))).toBeNull();
  });
});
