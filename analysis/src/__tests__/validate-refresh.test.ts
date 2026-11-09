import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { EXPANSION_RELEASE_DATE } from "../settings";
import { readPreviousArchetypeCount } from "../utils/assert-publishable";
import { REFRESH_WINDOWS, validateRefresh } from "../utils/validate-refresh";

const created: string[] = [];

const tmp = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "validate-refresh-"));
  created.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of created.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const PREMIUM: readonly string[] = ["30d", "all"];

const writeWindows = (
  dir: string,
  counts: Partial<Record<(typeof REFRESH_WINDOWS)[number], number>>,
  extra: Partial<Record<(typeof REFRESH_WINDOWS)[number], string[]>> = {},
  premiumDir: string = dir
): string[] => {
  const names: string[] = [];
  for (const window of REFRESH_WINDOWS) {
    const count = counts[window] ?? 0;
    const decks = [
      ...Array.from({ length: count }, (_, index) => ({
        name: `deck-${window}-${index}`,
      })),
      ...(extra[window] ?? []).map((name) => ({ name })),
    ];
    names.push(...decks.map((deck) => deck.name));
    const body = JSON.stringify(decks);
    const target = PREMIUM.includes(window) ? premiumDir : dir;
    fs.writeFileSync(path.join(target, `best-decks-${window}.json`), body);
    if (window === "20d") {
      fs.writeFileSync(path.join(dir, "best-decks.json"), body);
    }
  }
  return [...new Set(names)];
};

const writeImages = (dir: string, names: string[]): void => {
  fs.mkdirSync(dir, { recursive: true });
  for (const name of names) fs.writeFileSync(path.join(dir, `${name}.png`), "");
};

const writeTrendDate = (dir: string, date: string): void => {
  fs.writeFileSync(path.join(dir, "historical-trends.json"), JSON.stringify([{ date }]));
};

const writeMetaShareDate = (dir: string, window: string, generatedAt: string): void => {
  fs.writeFileSync(
    path.join(dir, `meta-share-${window}.json`),
    JSON.stringify({ generatedAt, decks: [] })
  );
};

const releaseDay = (days: number): string =>
  new Date(EXPANSION_RELEASE_DATE.getTime() + (days - 1) * 24 * 60 * 60 * 1000).toISOString();

const writePreviousDates = (dir: string): void => {
  for (const window of REFRESH_WINDOWS) {
    fs.writeFileSync(
      path.join(dir, `meta-share-${window}.json`),
      JSON.stringify({ generatedAt: EXPANSION_RELEASE_DATE.toISOString(), decks: [] })
    );
  }
};

const healthy = { "10d": 12, "20d": 25, "30d": 32, all: 32 } as const;

describe("validateRefresh", () => {
  it("passes when every window clears its floor and the union has one image each", () => {
    const data = tmp();
    const premium = tmp();
    const images = tmp();
    writeImages(images, writeWindows(data, healthy, {}, premium));

    const report = validateRefresh(data, images, null, premium);

    expect(report.failures).toEqual([]);
    expect(report.windows.map((row) => row.archetypes)).toEqual([12, 25, 32, 32]);
    expect(report.union).toBe(101);
    expect(report.images).toBe(101);
  });

  it("counts a name shared by two windows once", () => {
    const data = tmp();
    const premium = tmp();
    const images = tmp();
    writeImages(images, writeWindows(data, healthy, { all: ["deck-20d-0"] }, premium));

    const report = validateRefresh(data, images, null, premium);

    expect(report.union).toBe(101);
    expect(report.failures).toEqual([]);
  });

  it("fails when a deck name has no image", () => {
    const data = tmp();
    const premium = tmp();
    const images = tmp();
    const names = writeWindows(data, healthy, {}, premium);
    writeImages(images, names.slice(1));

    const report = validateRefresh(data, images, null, premium);

    expect(report.missingImages).toEqual([names[0]]);
    expect(report.failures).toEqual(["1 deck names have no OG image"]);
  });

  it("fails when an image matches no deck name", () => {
    const data = tmp();
    const premium = tmp();
    const images = tmp();
    writeImages(images, [...writeWindows(data, healthy, {}, premium), "retired-deck"]);

    const report = validateRefresh(data, images, null, premium);

    expect(report.orphanImages).toEqual(["retired-deck"]);
    expect(report.failures).toEqual(["1 OG images match no deck name"]);
  });

  it("fails when a window falls below half the previous snapshot", () => {
    const data = tmp();
    const premium = tmp();
    const images = tmp();
    const previous = tmp();
    writeImages(images, writeWindows(data, healthy, {}, premium));
    writeWindows(previous, { ...healthy, "10d": 40 });
    fs.writeFileSync(
      path.join(previous, "meta-share-10d.json"),
      JSON.stringify({ generatedAt: EXPANSION_RELEASE_DATE.toISOString(), decks: [] })
    );

    const report = validateRefresh(data, images, previous, premium);

    expect(report.windows[0]).toEqual({ window: "10d", archetypes: 12, floor: 20, previous: 40 });
    expect(report.failures).toEqual(["10d: 12 archetypes, floor 20 (50% of 40)"]);
  });

  it("uses the configured ratio for the previous-publish floor", () => {
    const data = tmp();
    const premium = tmp();
    const images = tmp();
    const previous = tmp();
    writeImages(images, writeWindows(data, healthy, {}, premium));
    writeWindows(previous, { ...healthy, "10d": 41 });
    writePreviousDates(previous);

    const report = validateRefresh(data, images, previous, premium, 0.75);

    expect(report.windows[0]).toEqual({ window: "10d", archetypes: 12, floor: 31, previous: 41 });
  });

  it("ignores a previous publish from before the current expansion", () => {
    const data = tmp();
    const premium = tmp();
    const images = tmp();
    const previous = tmp();
    writeImages(images, writeWindows(data, healthy, {}, premium));
    writeWindows(previous, { ...healthy, "10d": 40 });
    fs.writeFileSync(
      path.join(previous, "meta-share-10d.json"),
      JSON.stringify({
        generatedAt: new Date(EXPANSION_RELEASE_DATE.getTime() - 24 * 60 * 60 * 1000).toISOString(),
        decks: [],
      })
    );

    const report = validateRefresh(data, images, previous, premium);

    expect(report.windows[0]).toEqual({ window: "10d", archetypes: 12, floor: 12, previous: null });
    expect(report.failures).toEqual([]);
  });

  it("keeps the code floor when no previous snapshot exists", () => {
    const data = tmp();
    const premium = tmp();
    const images = tmp();
    writeImages(images, writeWindows(data, { ...healthy, "10d": 5 }, {}, premium));

    const report = validateRefresh(data, images, null, premium);

    expect(report.windows[0]).toEqual({ window: "10d", archetypes: 5, floor: 12, previous: null });
    expect(report.failures).toEqual(["10d: 5 archetypes, floor 12"]);
  });

  it("ramps the floor from the expansion release date", () => {
    const data = tmp();
    const premium = tmp();
    const images = tmp();
    const names = writeWindows(data, { ...healthy, "10d": 1 }, {}, premium);
    writeTrendDate(data, "2026-10-30T00:00:00.000Z");
    writeImages(images, names);

    const report = validateRefresh(data, images, null, premium);

    expect(report.windows.find((row) => row.window === "10d")?.floor).toBe(3);
    expect(report.failures).toContain("10d: 1 archetypes, floor 3");
  });

  it("uses the latest meta-share generatedAt date for the floor ramp", () => {
    const data = tmp();
    const premium = tmp();
    const images = tmp();
    const names = writeWindows(data, { ...healthy, "10d": 1 }, {}, premium);
    writeMetaShareDate(data, "10d", releaseDay(4));
    writeMetaShareDate(premium, "30d", releaseDay(2));
    writeMetaShareDate(premium, "all", releaseDay(3));
    writeImages(images, names);

    const report = validateRefresh(data, images, null, premium);

    expect(report.windows.find((row) => row.window === "10d")?.floor).toBe(5);
    expect(report.failures).toContain("10d: 1 archetypes, floor 5");
  });

  it("caps missing-previous floors at each published minimum after the ramp", () => {
    const data = tmp(); const premium = tmp(); const images = tmp();
    const names = writeWindows(data, healthy, {}, premium);
    writeMetaShareDate(data, "10d", releaseDay(120));
    writeImages(images, names);
    const report = validateRefresh(data, images, null, premium);
    expect(report.windows.map(({ floor }) => floor)).toEqual([12, 25, 32, 32]);
  });

  it("uses metadata generatedAt ahead of a later legacy trend date", () => {
    const data = tmp(); const premium = tmp(); const images = tmp();
    const names = writeWindows(data, { ...healthy, "10d": 1 }, {}, premium);
    writeMetaShareDate(data, "10d", releaseDay(4));
    writeTrendDate(data, releaseDay(120));
    writeImages(images, names);
    const report = validateRefresh(data, images, null, premium);
    expect(report.windows.find((row) => row.window === "10d")?.floor).toBe(5);
  });

  it("fails when the default file is not the 20d copy", () => {
    const data = tmp();
    const premium = tmp();
    const images = tmp();
    writeImages(images, writeWindows(data, healthy, {}, premium));
    fs.writeFileSync(path.join(data, "best-decks.json"), "[]");

    const report = validateRefresh(data, images, null, premium);

    expect(report.failures).toEqual(["best-decks.json differs from best-decks-20d.json"]);
  });

  it.each([
    ["20d", 51, 26, 25],
    ["30d", 65, 33, 32],
    ["all", 67, 34, 32],
  ] as const)(
    "rounds the half floor up for %s",
    (window, previousCount, floor, current) => {
      const data = tmp();
      const premium = tmp();
      const images = tmp();
      const previous = tmp();
      writeImages(images, writeWindows(data, healthy, {}, premium));
      writeWindows(previous, { ...healthy, [window]: previousCount });
      writePreviousDates(previous);

      const report = validateRefresh(data, images, previous, premium);

      const row = report.windows.find((entry) => entry.window === window);
      expect(row?.floor).toBe(floor);
      expect(row?.archetypes).toBe(current);
      expect(report.failures).toEqual([
        `${window}: ${current} archetypes, floor ${floor} (50% of ${previousCount})`,
      ]);
    }
  );

  it("fails when the default file is missing", () => {
    const data = tmp();
    const premium = tmp();
    const images = tmp();
    writeImages(images, writeWindows(data, healthy, {}, premium));
    fs.rmSync(path.join(data, "best-decks.json"));

    const report = validateRefresh(data, images, null, premium);

    expect(report.failures).toEqual(["best-decks.json is missing"]);
  });

  it("throws when the previous snapshot lacks a window file", () => {
    const data = tmp();
    const premium = tmp();
    const images = tmp();
    const previous = tmp();
    writeImages(images, writeWindows(data, healthy, {}, premium));
    writeWindows(previous, healthy);
    fs.rmSync(path.join(previous, "best-decks-10d.json"));

    expect(() => validateRefresh(data, images, previous, premium)).toThrow(
      /best-decks-10d\.json/
    );
  });

  it("treats a premium window missing from the previous snapshot as having no previous", () => {
    const data = tmp();
    const premium = tmp();
    const images = tmp();
    const previous = tmp();
    writeImages(images, writeWindows(data, healthy, {}, premium));
    writeWindows(previous, healthy);
    fs.rmSync(path.join(previous, "best-decks-30d.json"));

    const report = validateRefresh(data, images, previous, premium);

    expect(report.windows.find((row) => row.window === "30d")).toEqual({
      window: "30d",
      archetypes: 32,
      floor: 32,
      previous: null,
    });
    expect(report.failures).toEqual([]);
  });

  it("reads the premium windows from the premium directory and the others from the data directory", () => {
    const data = tmp();
    const premium = tmp();
    const images = tmp();
    writeImages(images, writeWindows(data, healthy, {}, premium));

    expect(fs.existsSync(path.join(data, "best-decks-30d.json"))).toBe(false);
    expect(fs.existsSync(path.join(premium, "best-decks-10d.json"))).toBe(false);
    const report = validateRefresh(data, images, null, premium);

    expect(report.windows.map((row) => row.archetypes)).toEqual([12, 25, 32, 32]);
    expect(report.failures).toEqual([]);
  });

  it("does not fall back to the data directory for a premium window", () => {
    const data = tmp();
    const premium = tmp();
    const images = tmp();
    writeWindows(data, healthy, {}, premium);
    fs.copyFileSync(
      path.join(premium, "best-decks-all.json"),
      path.join(data, "best-decks-all.json")
    );
    fs.rmSync(path.join(premium, "best-decks-all.json"));

    expect(() => validateRefresh(data, images, null, premium)).toThrow(/best-decks-all\.json/);
  });

  it("throws when a window file is missing", () => {
    const data = tmp();
    const premium = tmp();
    const images = tmp();
    writeWindows(data, healthy, {}, premium);
    fs.rmSync(path.join(premium, "best-decks-30d.json"));

    expect(() => validateRefresh(data, images, null, premium)).toThrow(/best-decks-30d\.json/);
  });
});

describe("notCompared", () => {
  it("names the windows that had no previous snapshot", () => {
    const data = tmp();
    const images = tmp();
    const premium = tmp();
    const names = writeWindows(data, { "10d": 1, "20d": 1, "30d": 1, all: 1 }, {}, premium);
    for (const name of names) {
      fs.writeFileSync(path.join(images, `${name}.png`), "");
    }
    const report = validateRefresh(data, images, null, premium);
    expect(report.notCompared).toEqual(["10d", "20d", "30d", "all"]);
  });

  it("stays empty when every window has a previous snapshot", () => {
    const data = tmp();
    const images = tmp();
    const premium = tmp();
    const previous = tmp();
    const counts = { "10d": 1, "20d": 1, "30d": 1, all: 1 } as const;
    const names = writeWindows(data, counts, {}, premium);
    writeWindows(previous, counts, {}, previous);
    writePreviousDates(previous);
    for (const name of names) {
      fs.writeFileSync(path.join(images, `${name}.png`), "");
    }
    const report = validateRefresh(data, images, previous, previous);
    expect(report.notCompared).toEqual([]);
  });
});

describe("gate and validate baseline parity", () => {
  it("reads the same previous archetype count from the same baseline files", () => {
    const data = tmp();
    const premium = tmp();
    const images = tmp();
    const previous = tmp();
    const names = writeWindows(data, healthy, {}, premium);
    writeImages(images, names);
    writeWindows(previous, healthy, {}, previous);
    writePreviousDates(previous);

    const report = validateRefresh(data, images, previous, premium);
    for (const row of report.windows) {
      const gatePrevious = readPreviousArchetypeCount(
        path.join(previous, `best-decks-${row.window}.json`),
        path.join(previous, `meta-share-${row.window}.json`),
        EXPANSION_RELEASE_DATE
      );
      expect(gatePrevious).toBe(row.previous);
    }
  });

  it("treats a missing premium baseline as no comparison in both readers", () => {
    const data = tmp();
    const premium = tmp();
    const images = tmp();
    const previous = tmp();
    const names = writeWindows(data, healthy, {}, premium);
    writeImages(images, names);
    for (const window of ["10d", "20d"]) {
      fs.writeFileSync(path.join(previous, `best-decks-${window}.json`), JSON.stringify([{ name: `old-${window}` }]));
      writeMetaShareDate(previous, window, EXPANSION_RELEASE_DATE.toISOString());
    }

    const report = validateRefresh(data, images, previous, premium);
    expect(report.notCompared).toContain("30d");
    expect(report.notCompared).toContain("all");
    for (const window of PREMIUM) {
      expect(report.windows.find((row) => row.window === window)?.previous).toBeNull();
      expect(readPreviousArchetypeCount(
        path.join(previous, `best-decks-${window}.json`),
        path.join(previous, `meta-share-${window}.json`),
        EXPANSION_RELEASE_DATE
      )).toBeNull();
    }
    expect(report.failures).toEqual([]);
  });
});
