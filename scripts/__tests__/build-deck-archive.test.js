const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  applyLive,
  deckShare,
  hubFileIssues,
  hubFileText,
  hubFilesFromState,
  listCardIds,
  variantStateFromHubs,
  variantStateFromSnapshots,
} = require("../build-deck-archive.mjs");

const legacyCard = (count, set, number, name) => ({ count, set, number, name });

test("a current list yields its count and card id strings unchanged", () => {
  const deck = {
    name: "mega-altaria-ex-b1-102",
    lists: [{ cards: ["2:b1-102", "1:b1-225"], score: 0.4, strength: 0.5 }],
  };
  assert.deepEqual(listCardIds(deck), ["2:b1-102", "1:b1-225"]);
});

test("a deck with object cards yields count and lower-case set-number ids", () => {
  const deck = {
    name: "Togekiss-A2-065",
    cards: [legacyCard(2, "A2", "65", "Togekiss"), legacyCard(2, "P-A", "7", "Professor's Research")],
  };
  assert.deepEqual(listCardIds(deck), ["2:a2-065", "2:pa-007"]);
});

test("a list that cannot be parsed yields no cards", () => {
  assert.deepEqual(listCardIds({ name: "x", lists: [{ cards: ["two:b1-102"] }] }), []);
  assert.deepEqual(listCardIds({ name: "x", cards: [{ count: 2, set: "A2" }] }), []);
  assert.deepEqual(listCardIds({ name: "x", percentOfGames: 0.1 }), []);
});

test("share is the percent of games, falling back to popularity", () => {
  assert.equal(deckShare({ percentOfGames: 0.2, popularity: 0.5 }), 0.2);
  assert.equal(deckShare({ popularity: 0.3 }), 0.3);
  assert.equal(deckShare({}), null);
});

test("snapshots keep the newest cards and the highest share with the date it was seen", () => {
  const state = variantStateFromSnapshots([
    {
      date: "2026-03-01",
      decks: [{ name: "mega-altaria-ex-b1-102", lists: [{ cards: ["2:b1-102"] }], percentOfGames: 0.1 }],
    },
    {
      date: "2026-02-01",
      decks: [
        { name: "mega-altaria-ex-b1-102", lists: [{ cards: ["1:b1-102"] }], percentOfGames: 0.3 },
        { name: "Greninja-B1-073", cards: [legacyCard(2, "B1", "73", "Greninja")], percentOfGames: 0.2 },
      ],
    },
    {
      date: "2026-01-01",
      decks: [{ name: "Greninja-B1-073", cards: [legacyCard(1, "B1", "73", "Greninja")], percentOfGames: 0.4 }],
    },
  ]);
  assert.deepEqual(state.get("mega-altaria-ex-b1-102"), {
    cards: ["2:b1-102"],
    peakShare: 0.3,
    peakDate: "2026-02-01",
  });
  assert.deepEqual(state.get("greninja-b1-073"), {
    cards: ["2:b1-073"],
    peakShare: 0.4,
    peakDate: "2026-01-01",
  });
});

test("an unparseable newest list leaves the cards empty rather than falling back", () => {
  const state = variantStateFromSnapshots([
    { date: "2026-03-01", decks: [{ name: "Vileplume-A1-001", lists: [{ cards: ["bad"] }], percentOfGames: 0.1 }] },
    { date: "2026-02-01", decks: [{ name: "Vileplume-A1-001", lists: [{ cards: ["2:a1-001"] }], percentOfGames: 0.1 }] },
  ]);
  assert.deepEqual(state.get("vileplume-a1-001").cards, []);
});

test("live decks refresh their cards and raise the peak only when the current share is higher", () => {
  const state = new Map([
    ["mega-altaria-ex-b1-102", { cards: ["2:b1-102"], peakShare: 0.3, peakDate: "2026-02-01" }],
  ]);
  applyLive(state, [{ name: "mega-altaria-ex-b1-102", lists: [{ cards: ["1:b1-102"] }], percentOfGames: 0.2 }], "2026-11-02");
  assert.deepEqual(state.get("mega-altaria-ex-b1-102"), {
    cards: ["1:b1-102"],
    peakShare: 0.3,
    peakDate: "2026-02-01",
  });
  applyLive(state, [{ name: "mega-altaria-ex-b1-102", lists: [{ cards: ["1:b1-102"] }], percentOfGames: 0.5 }], "2026-11-02");
  assert.deepEqual(state.get("mega-altaria-ex-b1-102"), {
    cards: ["1:b1-102"],
    peakShare: 0.5,
    peakDate: "2026-11-02",
  });
});

const archive = [
  {
    variant: "mega-altaria-ex-b1-102",
    hub: "mega-altaria-ex",
    name: "mega-altaria-ex-b1-102",
    firstSeen: "2025-10-31",
    lastSeen: "2026-11-02",
  },
  {
    variant: "mega-altaria-ex-b1-102&espeon-b3a-020",
    hub: "mega-altaria-ex",
    name: "Mega Altaria ex-B1-102&Espeon-B3a-020",
    firstSeen: "2025-12-01",
    lastSeen: "2026-01-15",
  },
];

const state = new Map([
  ["mega-altaria-ex-b1-102", { cards: ["2:b1-102", "1:b1-225"], peakShare: 0.3, peakDate: "2026-02-01" }],
  ["mega-altaria-ex-b1-102&espeon-b3a-020", { cards: [], peakShare: null, peakDate: null }],
]);

test("hub files list every variant with its name, dates, peak and cards", () => {
  const hub = hubFilesFromState(archive, state).get("mega-altaria-ex");
  assert.equal(hub.hub, "mega-altaria-ex");
  assert.equal(hub.name, "Mega Altaria ex");
  assert.deepEqual(hub.variants[0], {
    variant: "mega-altaria-ex-b1-102",
    name: "mega-altaria-ex-b1-102",
    firstSeen: "2025-10-31",
    lastSeen: "2026-11-02",
    peakShare: 0.3,
    peakDate: "2026-02-01",
    cards: ["2:b1-102", "1:b1-225"],
  });
  assert.equal(hub.variants[1].peakShare, null);
  assert.deepEqual(hub.variants[1].cards, []);
});

test("state read back from hub files matches the state that wrote them", () => {
  const restored = variantStateFromHubs([...hubFilesFromState(archive, state).values()]);
  for (const [variant, expected] of state) {
    assert.deepEqual(restored.get(variant), expected, variant);
  }
});

test("hub file checks report missing, stale and orphan files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hub-files-"));
  const expected = new Map([
    ["a", { hub: "a", name: "A", variants: [] }],
    ["b", { hub: "b", name: "B", variants: [] }],
    ["c", { hub: "c", name: "C", variants: [] }],
  ]);
  fs.writeFileSync(path.join(dir, "a.json"), hubFileText(expected.get("a")));
  fs.writeFileSync(path.join(dir, "b.json"), hubFileText({ hub: "b", name: "B", variants: [{}] }));
  fs.writeFileSync(path.join(dir, "z.json"), hubFileText({ hub: "z", name: "Z", variants: [] }));
  assert.deepEqual(hubFileIssues(expected, dir), [
    "b.json is stale",
    "c.json is missing",
    "z.json is an orphan",
  ]);
});

test("hub files clamp each peak date into the sighting range of its variant", () => {
  const entries = [{ variant: "alpha-b1-001", hub: "alpha", name: "Alpha-B1-001", firstSeen: "2026-10-30", lastSeen: "2026-11-02" }];
  const late = new Map([["alpha-b1-001", { cards: [], peakShare: 0.1, peakDate: "2026-11-03" }]]);
  assert.equal([...hubFilesFromState(entries, late).values()][0].variants[0].peakDate, "2026-11-02");
  const early = new Map([["alpha-b1-001", { cards: [], peakShare: 0.1, peakDate: "2026-10-01" }]]);
  assert.equal([...hubFilesFromState(entries, early).values()][0].variants[0].peakDate, "2026-10-30");
});

test("every committed hub file keeps each peak date inside its variant's sighting range", () => {
  const dir = path.join(__dirname, "..", "..", "public", "data", "hubs");
  const offenders = [];
  for (const name of fs.readdirSync(dir)) {
    const hub = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
    for (const variant of hub.variants) {
      if (variant.peakDate === null) continue;
      if (variant.peakDate < variant.firstSeen || variant.peakDate > variant.lastSeen) offenders.push(variant.variant);
    }
  }
  assert.deepEqual(offenders, []);
});
