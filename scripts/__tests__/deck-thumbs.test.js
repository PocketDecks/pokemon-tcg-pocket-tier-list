const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");

const {
  ART_SIZE,
  DECK_THUMB_CROP,
  DECK_THUMB_QUALITY,
  cardIdFromImage,
  deckThumbUrl,
  deriveCropRect,
} = require("../deck-thumbs.mjs");
const { deckNameToIconIds } = require("../deck-name.mjs");
const { findMissingThumbnailIds, generateThumbnails } = require("../generate-deck-thumbs.mjs");

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
    assert.strictEqual(deckThumbUrl("b3-081"), "/thumbs/v3/b3-081-183.webp?v=3");
  assert.strictEqual(deckThumbUrl("b3-081", 96), "/thumbs/v3/b3-081-96.webp?v=3");
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

test("regenerates an invalid cached thumbnail", async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "deck-thumbs-"));
  try {
    const source = await sharp({
      create: {
        width: 367,
        height: 512,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 1 },
      },
    }).png().toBuffer();
    const valid = await sharp({
      create: {
        width: 96,
        height: 96,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 1 },
      },
    }).webp().toBuffer();
    const damaged = Buffer.from(valid);
    damaged[21] = 0;
    fs.writeFileSync(path.join(outDir, "b3-081-96.webp"), damaged);
    fs.writeFileSync(path.join(outDir, "b3-081-183.webp"), Buffer.from("invalid"));

    assert.deepStrictEqual(await findMissingThumbnailIds(["b3-081"], outDir), ["b3-081"]);

    const generated = await generateThumbnails({
      decks: [{ name: "mega-lucario-ex-b3-081" }],
      imageById: new Map([["b3-081", source]]),
      outDir,
    });

    assert.deepStrictEqual(generated, ["b3-081"]);
    assert.deepStrictEqual(await findMissingThumbnailIds(["b3-081"], outDir), []);
    assert.equal((await sharp(fs.readFileSync(path.join(outDir, "b3-081-96.webp"))).metadata()).format, "webp");
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});
