import fs from "node:fs";
import path from "node:path";

import { MIN_PUBLISHED_ARCHETYPES } from "../settings";

export const REFRESH_WINDOWS = ["10d", "20d", "30d", "all"] as const;
export type RefreshWindow = (typeof REFRESH_WINDOWS)[number];

export interface WindowReport {
  window: RefreshWindow;
  archetypes: number;
  floor: number;
  previous: number | null;
}

export interface RefreshReport {
  windows: WindowReport[];
  union: number;
  images: number;
  missingImages: string[];
  orphanImages: string[];
  failures: string[];
}

const readDecks = (dir: string, window: RefreshWindow): { name: string }[] => {
  const file = path.join(dir, `best-decks-${window}.json`);
  if (!fs.existsSync(file)) throw new Error(`missing ${file}`);
  return JSON.parse(fs.readFileSync(file, "utf8")) as { name: string }[];
};

export const validateRefresh = (
  dataDir: string,
  imagesDir: string,
  previousDir: string | null
): RefreshReport => {
  const failures: string[] = [];
  const windows: WindowReport[] = [];
  const union = new Set<string>();

  for (const window of REFRESH_WINDOWS) {
    const decks = readDecks(dataDir, window);
    for (const deck of decks) union.add(deck.name);

    let previous: number | null = null;
    if (previousDir) {
      const file = path.join(previousDir, `best-decks-${window}.json`);
      if (fs.existsSync(file)) {
        previous = (JSON.parse(fs.readFileSync(file, "utf8")) as { name: string }[])
          .length;
      }
    }

    const floor = Math.max(
      MIN_PUBLISHED_ARCHETYPES[window],
      previous === null ? 0 : Math.ceil(previous / 2)
    );
    windows.push({ window, archetypes: decks.length, floor, previous });
    if (decks.length < floor) {
      failures.push(
        `${window}: ${decks.length} archetypes, floor ${floor}` +
          (previous === null ? "" : ` (half of ${previous})`)
      );
    }
  }

  const defaultFile = path.join(dataDir, "best-decks.json");
  const twentyDay = path.join(dataDir, "best-decks-20d.json");
  if (
    fs.existsSync(defaultFile) &&
    fs.existsSync(twentyDay) &&
    fs.readFileSync(defaultFile, "utf8") !== fs.readFileSync(twentyDay, "utf8")
  ) {
    failures.push("best-decks.json differs from best-decks-20d.json");
  }

  const images = fs.existsSync(imagesDir)
    ? fs
        .readdirSync(imagesDir)
        .filter((name) => name.endsWith(".png"))
        .map((name) => name.slice(0, -4))
    : [];
  const imageSet = new Set(images);
  const missingImages = [...union].filter((name) => !imageSet.has(name)).sort();
  const orphanImages = images.filter((name) => !union.has(name)).sort();

  if (missingImages.length) {
    failures.push(`${missingImages.length} deck names have no OG image`);
  }
  if (orphanImages.length) {
    failures.push(`${orphanImages.length} OG images match no deck name`);
  }

  return {
    windows,
    union: union.size,
    images: images.length,
    missingImages,
    orphanImages,
    failures,
  };
};
