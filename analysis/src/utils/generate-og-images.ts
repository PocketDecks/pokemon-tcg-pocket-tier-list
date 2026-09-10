import fs from "fs";
import path from "path";
import { createCanvas, loadImage } from "canvas";

interface OgDeckInput {
  slug: string;
  name: string;
  iconUrls: string[];
}

const WIDTH = 1200;
const HEIGHT = 630;

// Renders one PNG open-graph image per deck, pruning stale slugs, then writes them to the public og directory.
export const generateOgImages = async (decks: OgDeckInput[]): Promise<void> => {
  const OUTPUT_DIR = process.env.OG_OUTPUT_DIR
    ? path.resolve(process.env.OG_OUTPUT_DIR)
    : path.join(__dirname, "..", "..", "..", "public", "og", "deck");
  const LOGO_PATH = path.join(OUTPUT_DIR, "..", "..", "logo.png");
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const deck of decks) {
    if (
      deck.slug.includes("/") ||
      deck.slug.includes("\\") ||
      deck.slug.includes("..")
    ) {
      throw new Error(`Invalid OG image slug: "${deck.slug}"`);
    }
  }

  const currentSlugs = new Set(decks.map((d) => d.slug));
  for (const entry of fs.readdirSync(OUTPUT_DIR, { withFileTypes: true })) {
    if (entry.isDirectory() || !entry.name.endsWith(".png")) continue;
    const slug = entry.name.replace(/\.png$/, "");
    if (!currentSlugs.has(slug)) {
      fs.unlinkSync(path.join(OUTPUT_DIR, entry.name));
    }
  }

  let logo: any = null;
  try {
    logo = await loadImage(LOGO_PATH);
  } catch (err) {
    console.warn(`OG image: logo not found at ${LOGO_PATH}`);
  }

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
      const pngUrl = url.replace(/webp/g, "png");
      try {
        const img = await loadImage(pngUrl);
        ctx.drawImage(img, x, cardY, cardWidth, cardHeight);
      } catch (err) {
        console.warn(
          `OG image: failed to load card image for ${deck.slug}: ${pngUrl}`,
          err
        );
      }
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

    const buffer = canvas.toBuffer("image/png");
    fs.writeFileSync(path.join(OUTPUT_DIR, `${deck.slug}.png`), buffer);
  }

  console.log(`Generated ${decks.length} OG images in ${OUTPUT_DIR}`);
};
