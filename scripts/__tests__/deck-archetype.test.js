const test = require("node:test");
const assert = require("node:assert/strict");
const { deckArchetypeSlug, deckVariantSlug } = require("../deck-archetype.mjs");

test("archetype keys remove the lead card id only", () => {
  assert.equal(
    deckArchetypeSlug("mega-greninja-ex-c1-042&greninja-ex-b1-073"),
    "mega-greninja-ex"
  );
  assert.equal(deckArchetypeSlug("umbreon-c1-084&hydreigon-b1-157"), "umbreon");
  assert.equal(deckArchetypeSlug("garchomp"), "garchomp");
});

test("variant slugs retain every card id", () => {
  assert.equal(
    deckVariantSlug("mega-greninja-ex-c1-042&greninja-ex-b1-073"),
    "mega-greninja-ex-c1-042&greninja-ex-b1-073"
  );
});
