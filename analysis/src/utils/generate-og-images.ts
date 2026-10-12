import fs from "fs";
import os from "os";
import path from "path";
import { createCanvas, loadImage } from "canvas";

interface OgDeckInput {
  slug: string;
  name: string;
  iconUrls: string[];
}

export interface StagedOgImages {
  slugs: string[];
  commit: () => void;
  discard: () => void;
}

const WIDTH = 1200;
const HEIGHT = 630;
const FETCH_CONCURRENCY = 8;

const outputDirectory = (): string =>
  process.env.OG_OUTPUT_DIR
    ? path.resolve(process.env.OG_OUTPUT_DIR)
    : path.join(__dirname, "..", "..", "..", "public", "og", "deck");

const toPngUrl = (url: string): string => url.replace(/webp/g, "png");

const loadAll = async (urls: string[]): Promise<Map<string, Awaited<ReturnType<typeof loadImage>>>> => {
  const loaded = new Map<string, Awaited<ReturnType<typeof loadImage>>>();
  for (let start = 0; start < urls.length; start += FETCH_CONCURRENCY) {
    const batch = urls.slice(start, start + FETCH_CONCURRENCY);
    const images = await Promise.all(
      batch.map(async (url) => {
        try {
          return await loadImage(url);
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          throw new Error(`OG image: failed to load card image ${url}: ${reason}`);
        }
      })
    );
    batch.forEach((url, index) => loaded.set(url, images[index]));
  }
  return loaded;
};

// Renders one PNG per deck into a temporary directory and returns a handle that publishes or discards the set.
export const stageOgImages = async (decks: OgDeckInput[]): Promise<StagedOgImages> => {
  const target = outputDirectory();
  const logoPath = path.join(target, "..", "..", "logo.png");

  for (const deck of decks) {
    if (
      deck.slug.includes("/") ||
      deck.slug.includes("\\") ||
      deck.slug.includes("..")
    ) {
      throw new Error(`Invalid OG image slug: "${deck.slug}"`);
    }
  }

  const staging = fs.mkdtempSync(path.join(os.tmpdir(), "og-stage-"));
  const discard = () => fs.rmSync(staging, { recursive: true, force: true });

  try {
    let logo: Awaited<ReturnType<typeof loadImage>> | null = null;
    try {
      logo = await loadImage(logoPath);
    } catch (err) {
      console.warn(`OG image: logo not found at ${logoPath}`);
    }

    const icons = await loadAll([
      ...new Set(decks.flatMap((deck) => deck.iconUrls.map(toPngUrl))),
    ]);

    for (const deck of decks) {
      const canvas = createCanvas(WIDTH, HEIGHT);
      const ctx = canvas.getContext("2d");

      ctx.fillStyle = "#030303";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      if (logo) {
        const logoHeight = 56;
        const logoWidth = Math.round(logoHeight * (logo.width / logo.height));
        ctx.drawImage(logo, 40, 40, logoWidth, logoHeight);
        ctx.fillStyle = "#ffffff";
        ctx.font = "30px sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText("Top Pocket Decks", 40 + logoWidth + 18, 40 + logoHeight / 2);
      }

      const cardWidth = 260;
      const cardHeight = Math.round(cardWidth * (88 / 63));
      const gap = 40;
      const totalWidth =
        deck.iconUrls.length * cardWidth + (deck.iconUrls.length - 1) * gap;
      let x = (WIDTH - totalWidth) / 2;
      const cardY = 120;

      for (const url of deck.iconUrls) {
        ctx.drawImage(icons.get(toPngUrl(url))!, x, cardY, cardWidth, cardHeight);
        x += cardWidth + gap;
      }

      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 56px sans-serif";
      ctx.fillText(deck.name, WIDTH / 2, cardY + cardHeight + 70, WIDTH - 80);

      ctx.fillStyle = "#999999";
      ctx.font = "bold 26px sans-serif";
      ctx.fillText("Deck Profile", WIDTH / 2, cardY + cardHeight + 115);

      fs.writeFileSync(path.join(staging, `${deck.slug}.png`), canvas.toBuffer("image/png"));
    }
  } catch (error) {
    discard();
    throw error;
  }

  const slugs = decks.map((deck) => deck.slug);

  const commit = () => {
    fs.mkdirSync(target, { recursive: true });
    const current = new Set(slugs);
    for (const slug of slugs) {
      const staged = path.join(staging, `${slug}.png`);
      const published = path.join(target, `${slug}.png`);
      if (fs.existsSync(published) && fs.readFileSync(published).equals(fs.readFileSync(staged))) {
        continue;
      }
      fs.copyFileSync(staged, published);
    }
    for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
      if (entry.isDirectory() || !entry.name.endsWith(".png")) continue;
      if (!current.has(entry.name.replace(/\.png$/, ""))) {
        fs.unlinkSync(path.join(target, entry.name));
      }
    }
    console.log(`Published ${slugs.length} OG images in ${target}`);
    discard();
  };

  return { slugs, commit, discard };
};
