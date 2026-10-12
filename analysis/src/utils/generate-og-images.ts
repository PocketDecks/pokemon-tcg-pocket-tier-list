import fs from "fs";
import path from "path";
import { createCanvas, loadImage } from "canvas";
import { renameWithRetry } from "./rename-with-retry";

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

  // The pipeline writes the JSON before commit runs, so a swap that commit
  // would refuse has to be refused here, before anything is written.
  const backup = `${target}.previous`;
  if (fs.existsSync(backup)) {
    throw new Error(`Refusing to publish: a previous image directory is still at ${backup}`);
  }

  // A file held open inside the live directory blocks its rename on Windows,
  // so prove the swap can happen before anything is rendered.
  if (fs.existsSync(target)) {
    let moved = false;
    try {
      renameWithRetry(target, backup);
      moved = true;
      renameWithRetry(backup, target);
    } catch {
      if (moved) {
        try {
          renameWithRetry(backup, target);
        } catch (restoreError) {
          console.warn(`Could not restore ${target} from ${backup}:`, restoreError);
        }
      }
      throw new Error(`Refusing to publish: ${target} is locked, so nothing has been written`);
    }
  }

  // Staging beside the target keeps the swap on one volume, where the rename
  // cannot fail with EXDEV.
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const staging = fs.mkdtempSync(
    path.join(path.dirname(target), `${path.basename(target)}-stage-`)
  );
  // mkdtempSync creates the directory 0700, and the swap publishes that mode.
  fs.chmodSync(staging, 0o755);
  // force: commit renames the staging directory into place, so discard may
  // find it already gone.
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

  // Publish by renaming directories. A per-file copy leaves the directory
  // half-old and half-new if it fails partway, and a reader can observe that
  // window. rename is atomic, so the directory flips in one step and the
  // previous generation survives as the backup until the swap succeeds.
  const swap = () => {
    const parent = path.dirname(target);
    fs.mkdirSync(parent, { recursive: true });
    if (fs.existsSync(backup)) {
      throw new Error(`Refusing to publish: a previous image directory is still at ${backup}`);
    }

    const previous = fs.existsSync(target);
    // Carry an unchanged image's timestamp onto its staged twin, so the swap
    // publishes byte-identical files under their original mtime and a cache
    // still serves them.
    if (previous) {
      for (const slug of slugs) {
        const published = path.join(target, `${slug}.png`);
        const staged = path.join(staging, `${slug}.png`);
        if (!fs.existsSync(published) || !fs.existsSync(staged)) continue;
        if (!fs.readFileSync(published).equals(fs.readFileSync(staged))) continue;
        const { atime, mtime } = fs.statSync(published);
        fs.utimesSync(staged, atime, mtime);
      }
    }

    if (previous) renameWithRetry(target, backup);
    try {
      renameWithRetry(staging, target);
    } catch (error) {
      if (previous && !fs.existsSync(target)) renameWithRetry(backup, target);
      throw error;
    }
    if (previous) {
      try {
        fs.rmSync(backup, { recursive: true, force: true });
      } catch (cleanupError) {
        console.warn(
          `Could not remove the previous image directory ${backup}. The published ` +
            `set is live; remove the backup before rerunning:`,
          cleanupError
        );
      }
    }

    console.log(`Published ${slugs.length} OG images in ${target}`);
  };

  const commit = () => {
    try {
      swap();
    } catch (error) {
      discard();
      throw error;
    }
  };

  return { slugs, commit, discard };
};
