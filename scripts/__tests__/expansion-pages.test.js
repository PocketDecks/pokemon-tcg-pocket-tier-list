const test = require("node:test");
const assert = require("node:assert/strict");
const { newestCoveredExpansion } = require("../../src/app/expansion-feed.mjs");

test("selects the newest listed expansion covered by live deck cards", () => {
  const expansions = [
    { id: "b4a", name: "Team Rocket's Ambition", release_date: "2026-08-27" },
    { id: "c1", name: "Dual Fusion", release_date: "2026-10-29" },
  ];
  const decks = [{ lists: [{ cards: ["2:b4a-001"] }] }];
  assert.equal(newestCoveredExpansion(expansions, decks).id, "b4a");
});

test("returns null when no live deck card covers a listed expansion", () => {
  const expansions = [{ id: "c1", name: "Dual Fusion", release_date: "2026-10-29" }];
  assert.equal(newestCoveredExpansion(expansions, [{ lists: [{ cards: ["2:a1-001"] }] }]), null);
});
