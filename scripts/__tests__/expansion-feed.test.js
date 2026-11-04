const test = require("node:test");
const assert = require("node:assert");
const expansions = require("pokemon-tcg-pocket-cards/data/v5/expansions.min.json");
const { newestCoveredExpansion } = require("../../src/app/expansion-feed.mjs");

const deck = (...cards) => ({ name: "deck", lists: [{ cards }] });

test("a feed containing c1 cards names Dual Fusion", () => {
  const latest = newestCoveredExpansion(expansions, [deck("2:c1-018", "1:a1-004")]);
  assert.strictEqual(latest.name, "Dual Fusion");
});

test("a feed whose newest cards are b4a names Team Rocket's Ambition", () => {
  const latest = newestCoveredExpansion(expansions, [deck("2:b4a-001", "1:b1-073")]);
  assert.strictEqual(latest.name, "Team Rocket's Ambition");
});

test("a feed with no listed-expansion cards gets null", () => {
  assert.strictEqual(newestCoveredExpansion(expansions, [deck("2:zz9-001")]), null);
  assert.strictEqual(newestCoveredExpansion(expansions, []), null);
  assert.strictEqual(newestCoveredExpansion(expansions, null), null);
});

test("deluxe and promo sets are never named", () => {
  assert.strictEqual(newestCoveredExpansion(expansions, [deck("2:b4b-001", "1:b4a-002")]).name, "Team Rocket's Ambition");
  assert.strictEqual(newestCoveredExpansion(expansions, [deck("2:pa-007")]), null);
});

test("card entries given as objects with an id are read too", () => {
  const latest = newestCoveredExpansion(expansions, [{ name: "deck", lists: [{ cards: [{ id: "c1-018" }] }] }]);
  assert.strictEqual(latest.name, "Dual Fusion");
});
