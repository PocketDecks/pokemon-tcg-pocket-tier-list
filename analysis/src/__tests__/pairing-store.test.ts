import {
  PairingStore,
  ResolvedDeck,
  ensureSeeded,
  mergeDeck,
  snapshot,
} from "../utils/pairing-store";

const emptyStore = (): PairingStore => ({
  updatedAt: null,
  currentSet: null,
  pairings: {},
});

const deck = (
  set: string,
  count: number,
  ...cards: [string, string, string][]
): ResolvedDeck => ({
  set,
  name: "Test Archetype",
  count,
  cards: cards.map(([name, cardSet, number]) => ({ name, set: cardSet, number })),
});

describe("mergeDeck", () => {
  it("reports added for a primary the store has not seen", () => {
    const store = emptyStore();
    const outcome = mergeDeck(store, deck("B4a", 12, ["Greninja", "a1", "89"]));
    expect(outcome).toBe("added");
    expect(store.pairings["Greninja A1 89"]).toEqual({
      secondary: [],
      peakCountBySet: { B4a: 12 },
      names: { "Test Archetype": 12 },
    });
  });

  it("folds partners onto the existing primary rather than starting a row", () => {
    const store = emptyStore();
    mergeDeck(store, deck("B4a", 12, ["Greninja", "a1", "89"]));
    const outcome = mergeDeck(
      store,
      deck("B4a", 30, ["Greninja", "a1", "89"], ["Charizard ex", "a1", "36"])
    );
    expect(outcome).toBe("merged");
    expect(store.pairings["Greninja A1 89"].secondary).toEqual(["Charizard ex A1 36"]);
    expect(Object.keys(store.pairings)).toEqual(["Greninja A1 89"]);
  });

  it("keeps the peak count per set rather than the latest", () => {
    const store = emptyStore();
    mergeDeck(store, deck("B4a", 30, ["Greninja", "a1", "89"]));
    mergeDeck(store, deck("B4a", 12, ["Greninja", "a1", "89"]));
    expect(store.pairings["Greninja A1 89"].peakCountBySet).toEqual({ B4a: 30 });
  });

  it("reports unresolved when the deck resolved to no cards", () => {
    const store = emptyStore();
    expect(mergeDeck(store, deck("B4a", 5))).toBe("unresolved");
    expect(store.pairings).toEqual({});
  });

  it("normalises the set code when building the key", () => {
    const store = emptyStore();
    mergeDeck(store, deck("PA", 3, ["Lapras ex", "p-a", "14"]));
    expect(Object.keys(store.pairings)).toEqual(["Lapras ex PA 14"]);
  });
});

describe("snapshot", () => {
  it("is stable when nothing moved", () => {
    const store = emptyStore();
    mergeDeck(store, deck("B4a", 12, ["Greninja", "a1", "89"]));
    const before = snapshot(store);
    // A re-merge of an identical row is a no-op, even though mergeDeck
    // reports "merged" for it. That mismatch is exactly why a snapshot
    // exists rather than a tally check.
    expect(mergeDeck(store, deck("B4a", 12, ["Greninja", "a1", "89"]))).toBe("merged");
    expect(snapshot(store)).toBe(before);
  });

  it("moves when a partner is added", () => {
    const store = emptyStore();
    mergeDeck(store, deck("B4a", 12, ["Greninja", "a1", "89"]));
    const before = snapshot(store);
    mergeDeck(store, deck("B4a", 12, ["Greninja", "a1", "89"], ["Charizard ex", "a1", "36"]));
    expect(snapshot(store)).not.toBe(before);
  });

  it("moves when a peak count rises", () => {
    const store = emptyStore();
    mergeDeck(store, deck("B4a", 12, ["Greninja", "a1", "89"]));
    const before = snapshot(store);
    mergeDeck(store, deck("B4a", 40, ["Greninja", "a1", "89"]));
    expect(snapshot(store)).not.toBe(before);
  });

  it("ignores updatedAt, which moves on every run by definition", () => {
    const store = emptyStore();
    mergeDeck(store, deck("B4a", 12, ["Greninja", "a1", "89"]));
    const before = snapshot(store);
    store.updatedAt = new Date().toISOString();
    expect(snapshot(store)).toBe(before);
  });
});

describe("ensureSeeded", () => {
  it("adds a missing primary with an empty entry", () => {
    const store = emptyStore();
    ensureSeeded(store, ["Oricorio A3 66"]);
    expect(store.pairings["Oricorio A3 66"]).toEqual({
      secondary: [],
      peakCountBySet: {},
      names: {},
    });
  });

  it("leaves a primary the scrape already produced alone", () => {
    const store = emptyStore();
    mergeDeck(store, deck("A3", 9, ["Oricorio", "a3", "66"]));
    ensureSeeded(store, ["Oricorio A3 66"]);
    expect(store.pairings["Oricorio A3 66"].peakCountBySet).toEqual({ A3: 9 });
  });
});
