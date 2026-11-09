import fs from "node:fs";
import path from "node:path";

import {
  EXPANSION_RELEASE_DATE,
  FLOOR_RAMP_DAYS,
  MIN_PUBLISHED_ARCHETYPES,
} from "../settings";
import {
  daysOfDataSince,
  readPreviousArchetypeCount,
} from "./assert-publishable";
import { PREMIUM_WINDOWS } from "./premium-artefacts";

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
  notCompared: RefreshWindow[];
  union: number;
  images: number;
  missingImages: string[];
  orphanImages: string[];
  failures: string[];
}

const isPremiumWindow = (window: RefreshWindow): boolean =>
  (PREMIUM_WINDOWS as readonly string[]).includes(window);

const readDecks = (dir: string, window: RefreshWindow): { name: string }[] => {
  const file = path.join(dir, `best-decks-${window}.json`);
  if (!fs.existsSync(file)) throw new Error(`missing ${file}`);
  return JSON.parse(fs.readFileSync(file, "utf8")) as { name: string }[];
};

const readPreviousCount = (
  previousDir: string | null,
  window: RefreshWindow
): number | null => {
  if (previousDir === null) return null;
  if (
    isPremiumWindow(window) &&
    !fs.existsSync(path.join(previousDir, `best-decks-${window}.json`))
  ) {
    return null;
  }
  const bestDecksFile = path.join(previousDir, `best-decks-${window}.json`);
  if (!fs.existsSync(bestDecksFile)) return readDecks(previousDir, window).length;
  return readPreviousArchetypeCount(
    bestDecksFile,
    path.join(previousDir, `meta-share-${window}.json`),
    EXPANSION_RELEASE_DATE
  );
};

const readNewestDeckDate = (dataDir: string, premiumDir: string): string | null => {
  const metaFiles = [
    path.join(dataDir, "meta-share-10d.json"),
    path.join(premiumDir, "meta-share-30d.json"),
    path.join(premiumDir, "meta-share-all.json"),
  ];
  const dates = metaFiles
    .filter((file) => fs.existsSync(file))
    .map((file) => {
      const value = (JSON.parse(fs.readFileSync(file, "utf8")) as { generatedAt?: unknown }).generatedAt;
      if (typeof value !== "string") throw new Error(`missing generatedAt in ${file}`);
      return value;
    })
    .sort();
  return dates.length > 0 ? dates[dates.length - 1].slice(0, 10) : null;
};

const readLegacyTrendDate = (dataDir: string): string | null => {
  const file = path.join(dataDir, "historical-trends.json");
  if (!fs.existsSync(file)) return null;
  const rows = JSON.parse(fs.readFileSync(file, "utf8")) as { date?: unknown }[];
  const dates = rows
    .map((row) => (typeof row.date === "string" ? row.date : null))
    .filter((date): date is string => date !== null)
    .sort();
  if (dates.length === 0) return null;
  return dates[dates.length - 1].slice(0, 10);
};

export const validateRefresh = (
  dataDir: string,
  imagesDir: string,
  previousDir: string | null,
  premiumDir: string
): RefreshReport => {
  const failures: string[] = [];
  const windows: WindowReport[] = [];
  const union = new Set<string>();
  const newestDeckDate = readNewestDeckDate(dataDir, premiumDir) ?? readLegacyTrendDate(dataDir);
  const daysOfData = newestDeckDate === null ? null : daysOfDataSince(newestDeckDate, EXPANSION_RELEASE_DATE);

  for (const window of REFRESH_WINDOWS) {
    const decks = readDecks(isPremiumWindow(window) ? premiumDir : dataDir, window);
    for (const deck of decks) union.add(deck.name);

    const previous = readPreviousCount(previousDir, window);

    const configuredFloor =
      daysOfData === null
        ? MIN_PUBLISHED_ARCHETYPES[window]
        : Math.ceil(
            (MIN_PUBLISHED_ARCHETYPES[window] *
              Math.min(daysOfData, FLOOR_RAMP_DAYS[window])) /
              FLOOR_RAMP_DAYS[window]
          );
    const floor = Math.max(configuredFloor, previous === null ? 0 : Math.ceil(previous / 2));
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
  if (!fs.existsSync(defaultFile)) {
    failures.push("best-decks.json is missing");
  } else if (
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
    notCompared: windows.filter((row) => row.previous === null).map((row) => row.window),
    union: union.size,
    images: images.length,
    missingImages,
    orphanImages,
    failures,
  };
};
