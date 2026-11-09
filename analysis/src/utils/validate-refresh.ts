import fs from "node:fs";
import path from "node:path";

import {
  EXPANSION_RELEASE_DATE,
  FLOOR_RAMP_DAYS,
  MIN_PUBLISHED_ARCHETYPES,
} from "../settings";
import { daysOfDataSince } from "./assert-publishable";
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
  return readDecks(previousDir, window).length;
};

const readDaysOfData = (dataDir: string): number | null => {
  const file = path.join(dataDir, "historical-trends.json");
  if (!fs.existsSync(file)) return null;
  try {
    const rows = JSON.parse(fs.readFileSync(file, "utf8")) as { date?: unknown }[];
    const dates = rows
      .map((row) => (typeof row.date === "string" ? row.date : null))
      .filter((date): date is string => date !== null)
      .sort();
    const newest = dates.length > 0 ? dates[dates.length - 1] : undefined;
    return newest === undefined ? null : daysOfDataSince(newest, EXPANSION_RELEASE_DATE);
  } catch {
    return null;
  }
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
  const daysOfData = readDaysOfData(dataDir);

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
