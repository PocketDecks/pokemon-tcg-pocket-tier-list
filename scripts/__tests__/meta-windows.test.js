const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ARTEFACT_BASES,
  DEFAULT_WINDOW,
  PREMIUM_BASES,
  PREMIUM_WINDOWS,
  TRIMMED_BASES,
  TRIMMED_WINDOWS,
  WINDOW_IDS,
  WINDOW_LENGTH_DAYS,
  isPremiumWindow,
  windowArtefactName,
  windowDataFile,
} = require("../meta-windows.mjs");

test("only the Supporter windows are premium", () => {
  assert.deepEqual(WINDOW_IDS.filter(isPremiumWindow), ["30d", "all"]);
  assert.equal(isPremiumWindow("20d"), false);
  assert.equal(isPremiumWindow("toString"), false);
});

test("window model lists", () => {
  assert.deepEqual(WINDOW_IDS, ["10d", "20d", "30d", "all"]);
  assert.equal(DEFAULT_WINDOW, "20d");
  assert.deepEqual(PREMIUM_WINDOWS, ["30d", "all"]);
  assert.deepEqual(TRIMMED_WINDOWS, ["10d", "20d"]);
  assert.deepEqual(WINDOW_LENGTH_DAYS, { "10d": 10, "20d": 20, "30d": 30, all: null });
  assert.deepEqual(ARTEFACT_BASES, ["best-decks", "meta-share", "matchup-data"]);
  assert.deepEqual(PREMIUM_BASES, ["best-decks", "matchup-data", "meta-share"]);
  assert.deepEqual(TRIMMED_BASES, ["meta-share"]);
});

test("file names leave the default window un-suffixed", () => {
  assert.equal(windowDataFile("best-decks", "20d"), "best-decks.json");
  assert.equal(windowDataFile("best-decks", "10d"), "best-decks-10d.json");
  assert.equal(windowDataFile("meta-share", "all"), "meta-share-all.json");
  assert.equal(windowArtefactName("meta-share", "20d"), "meta-share-20d");
});
