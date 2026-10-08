const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");

const {
  ART_SIZE,
  CARD_THUMB_WIDTHS,
  DECK_THUMB_CROP,
  DECK_THUMB_QUALITY,
  cardIdFromImage,
  cardThumbHeight,
  cardThumbSrcSet,
  cardThumbUrl,
  deckListCardIds,
  deckThumbUrl,
  deriveCropRect,
  firstBestListCardId,
} = require("../deck-thumbs.mjs");
const { deckNameToIconIds } = require("../deck-name.mjs");
const {
  findMissingCardThumbnailIds,
  findMissingThumbnailIds,
  generateThumbnails,
} = require("../generate-deck-thumbs.mjs");

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

test("sizes full-card thumbnails at 120 and 240 wide, keeping the 367:512 aspect", () => {
  assert.deepStrictEqual(CARD_THUMB_WIDTHS, [120, 240]);
  assert.strictEqual(cardThumbHeight(120), 167);
  assert.strictEqual(cardThumbHeight(240), 335);
});

test("serves full-card thumbnails from the versioned cards folder", () => {
  assert.strictEqual(cardThumbUrl("b1-184", 120), "/thumbs/v3/cards/b1-184-120.webp?v=3");
  assert.strictEqual(
    cardThumbSrcSet("b1-184"),
    "/thumbs/v3/cards/b1-184-120.webp?v=3 120w, /thumbs/v3/cards/b1-184-240.webp?v=3 240w"
  );
});

test("collects every card id from every deck list, once", () => {
  const decks = [
    { name: "mega-altaria-ex-b1-102&espeon-b3a-020", lists: [{ cards: ["2:b1-184", "1:b1-102"] }] },
    { name: "mega-lucario-ex-b3-081", lists: [{ cards: ["1:b1-102", "2:pa-007"] }, { cards: ["2:b1-184"] }] },
    { name: "no-lists" },
  ];
  assert.deepStrictEqual(deckListCardIds(decks), ["b1-184", "b1-102", "pa-007"]);
});

test("takes the first card of the highest-scoring list, keeping the first on a tie", () => {
  assert.strictEqual(
    firstBestListCardId({
      lists: [
        { score: 0.5, cards: ["2:b1-184", "1:b1-102"] },
        { score: 0.7, cards: ["1:b3-081", "2:b1-184"] },
        { score: 0.7, cards: ["2:pa-007"] },
      ],
    }),
    "b3-081"
  );
});

test("regenerates full-card thumbnails at their widths and reports the missing ones", async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "deck-card-thumbs-"));
  try {
    const source = await sharp({
      create: { width: 367, height: 512, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
    }).png().toBuffer();
    const decks = [{ name: "mega-lucario-ex-b3-081", lists: [{ cards: ["2:b1-184"] }] }];

    assert.deepStrictEqual(await findMissingCardThumbnailIds(["b1-184"], outDir), ["b1-184"]);

    const generated = await generateThumbnails({
      decks,
      imageById: new Map([
        ["b3-081", source],
        ["b1-184", source],
      ]),
      outDir,
    });

    assert.deepStrictEqual(generated.sort(), ["b1-184", "b3-081"]);
    assert.deepStrictEqual(await findMissingCardThumbnailIds(["b1-184"], outDir), []);
    for (const width of [120, 240]) {
      const metadata = await sharp(fs.readFileSync(path.join(outDir, "cards", `b1-184-${width}.webp`))).metadata();
      assert.strictEqual(metadata.format, "webp");
      assert.strictEqual(metadata.width, width);
      assert.strictEqual(metadata.height, cardThumbHeight(width));
    }
    assert.ok(fs.existsSync(path.join(outDir, "b3-081-96.webp")));
    assert.ok(fs.existsSync(path.join(outDir, "b3-081-183.webp")));
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});
