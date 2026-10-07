const test = require("node:test");
const assert = require("node:assert");

const {
  ART_SIZE,
  DECK_THUMB_CROP,
  DECK_THUMB_QUALITY,
  cardIdFromImage,
  deckThumbUrl,
  deriveCropRect,
} = require("../deck-thumbs.mjs");
const { deckNameToIconIds } = require("../deck-name.mjs");

test("derives the tile crop window from the art geometry", () => {
  assert.deepStrictEqual(DECK_THUMB_CROP, {
    left: 92,
    top: 59,
    width: 183,
    height: 183,
  });
});

test("keeps the crop square and inside the 367x512 source", () => {
  const crop = deriveCropRect();
  assert.strictEqual(crop.width, crop.height);
  assert.ok(crop.left >= 0 && crop.left + crop.width <= ART_SIZE.width);
  assert.ok(crop.top >= 0 && crop.top + crop.height <= ART_SIZE.height);
});

test("recomputes the window when the art aspect ratio changes", () => {
  const crop = deriveCropRect({ width: 734, height: 1024 });
  assert.strictEqual(crop.left, 184);
  assert.strictEqual(crop.top, 117);
  assert.strictEqual(crop.width, 366);
  assert.strictEqual(crop.height, 366);
});

test("encodes thumbnails at quality 80", () => {
  assert.strictEqual(DECK_THUMB_QUALITY, 80);
});

test("maps a deck name to its icon ids, primary first", () => {
  assert.deepStrictEqual(deckNameToIconIds("mega-lucario-ex-b3-081"), ["b3-081"]);
  assert.deepStrictEqual(deckNameToIconIds("mega-altaria-ex-b1-102&espeon-b3a-020"), [
    "b1-102",
    "b3a-020",
  ]);
  assert.deepStrictEqual(deckNameToIconIds("Malformed"), []);
});

test("serves thumbnails from the first-party path", () => {
    assert.strictEqual(deckThumbUrl("b3-081"), "/thumbs/b3-081.webp?v=2");
});

test("reads the card id back out of the upstream image url", () => {
  assert.strictEqual(
    cardIdFromImage(
      "https://raw.githubusercontent.com/chase-manning/pokemon-tcg-pocket-cards/refs/heads/main/images/webp/cards/b3/081.webp"
    ),
    "b3-081"
  );
  assert.strictEqual(cardIdFromImage("/local/thumb.webp"), null);
});
