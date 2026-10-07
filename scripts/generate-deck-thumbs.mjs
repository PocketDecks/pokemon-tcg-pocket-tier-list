import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import sharp from "sharp";
import { deckNameToIconIds } from "./deck-name.mjs";
import { cardIdFromImage, DECK_THUMB_CROP, DECK_THUMB_QUALITY, DECK_THUMB_SIZES, DECK_THUMB_VERSION } from "./deck-thumbs.mjs";

const ATTEMPTS = 3;

const fetchBuffer = async (url) => {
  let lastError;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`${url}: ${lastError?.message ?? "unknown error"}`);
};

export const thumbCardIds = (decks) => {
  const ids = new Set();
  for (const deck of decks) {
    for (const id of deckNameToIconIds(deck.name)) ids.add(id);
  }
  return [...ids];
};

export const cropArt = (buffer, size) =>
  sharp(buffer)
    .extract(DECK_THUMB_CROP)
    .resize(size, size)
    .webp({ quality: DECK_THUMB_QUALITY })
    .toBuffer();

const runWithConcurrency = async (items, worker, concurrency) => {
  const results = [];
  let nextIndex = 0;
  const run = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await worker(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
};

const main = async () => {
  const cwd = process.cwd();
  const decksPath = path.join(cwd, "public", "data", "best-decks.json");
  const decks = JSON.parse(fs.readFileSync(decksPath, "utf8"));
  const cards = JSON.parse(
    fs.readFileSync(
      path.join(
        cwd,
        "node_modules",
        "pokemon-tcg-pocket-cards",
        "data",
        "v5",
        "cards.core.min.json"
      ),
      "utf8"
    )
  );
  const imageById = new Map(cards.map((card) => [card.id, card.image]));

  const outDir = path.join(cwd, "public", "thumbs", `v${DECK_THUMB_VERSION}`);
  fs.mkdirSync(outDir, { recursive: true });

  const ids = thumbCardIds(decks).filter((id) =>
    DECK_THUMB_SIZES.some((size) => !fs.existsSync(path.join(outDir, `${id}-${size}.webp`)))
  );
  const generated = await runWithConcurrency(
    ids,
    async (id) => {
      const image = imageById.get(id);
      if (!image) {
        throw new Error(`generate-deck-thumbs: no card record for ${id}`);
      }
      const source = await fetchBuffer(image);
      await Promise.all(
        DECK_THUMB_SIZES.map(async (size) => {
          const thumb = await cropArt(source, size);
          fs.writeFileSync(path.join(outDir, `${id}-${size}.webp`), thumb);
        })
      );
      return id;
    },
    8
  );
  console.log(`generate-deck-thumbs: wrote ${generated.length} thumbnails to ${outDir}`);
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`generate-deck-thumbs: ${error.message}`);
    process.exit(1);
  });
}
