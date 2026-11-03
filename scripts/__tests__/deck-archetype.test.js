const test = require("node:test");
const assert = require("node:assert/strict");
const { deckArchetypeSlug, deckVariantSlug, hubDisplayName, hubSeenRange } = require("../deck-archetype.mjs");

const entry = (name, firstSeen, lastSeen) => ({
  variant: deckVariantSlug(name),
  hub: deckArchetypeSlug(name),
  name,
  firstSeen,
  lastSeen,
});

test("hub display names come from the latest variant's lead card in every archive format", () => {
  assert.equal(
    hubDisplayName([
      entry("mega-greninja-ex-c1-042&greninja-ex-b1-073", "2026-01-01", "2026-09-01"),
      entry("Mega Greninja ex-B1-040", "2025-10-01", "2026-02-01"),
    ]),
    "Mega Greninja ex"
  );
  assert.equal(
    hubDisplayName([
      entry("mega-altaria-ex-b1-102", "2025-10-31", "2025-10-31"),
      entry("Mega Altaria ex-B1-102", "2025-10-31", "2026-09-09"),
    ]),
    "Mega Altaria ex"
  );
  assert.equal(hubDisplayName([entry("Abomasnow-A2a-021&Arceus ex-A2a-071", "2025-05-12", "2026-01-31")]), "Abomasnow");
});

test("hub seen range spans every variant", () => {
  assert.deepEqual(
    hubSeenRange([
      entry("mega-greninja-ex-c1-042&greninja-ex-b1-073", "2026-01-01", "2026-09-01"),
      entry("Mega Greninja ex-B1-040", "2025-10-01", "2026-02-01"),
    ]),
    { firstSeen: "2025-10-01", lastSeen: "2026-09-01" }
  );
});

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
