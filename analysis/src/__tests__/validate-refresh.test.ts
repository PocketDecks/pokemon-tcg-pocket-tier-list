import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

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

const writeWindows = (
  dir: string,
  counts: Partial<Record<(typeof REFRESH_WINDOWS)[number], number>>,
  extra: Partial<Record<(typeof REFRESH_WINDOWS)[number], string[]>> = {}
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
    fs.writeFileSync(path.join(dir, `best-decks-${window}.json`), body);
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

const healthy = { "10d": 12, "20d": 25, "30d": 32, all: 32 } as const;

describe("validateRefresh", () => {
  it("passes when every window clears its floor and the union has one image each", () => {
    const data = tmp();
    const images = tmp();
    writeImages(images, writeWindows(data, healthy));

    const report = validateRefresh(data, images, null);

    expect(report.failures).toEqual([]);
    expect(report.windows.map((row) => row.archetypes)).toEqual([12, 25, 32, 32]);
    expect(report.union).toBe(101);
    expect(report.images).toBe(101);
  });

  it("counts a name shared by two windows once", () => {
    const data = tmp();
    const images = tmp();
    writeImages(images, writeWindows(data, healthy, { all: ["deck-20d-0"] }));

    const report = validateRefresh(data, images, null);

    expect(report.union).toBe(101);
    expect(report.failures).toEqual([]);
  });

  it("fails when a deck name has no image", () => {
    const data = tmp();
    const images = tmp();
    const names = writeWindows(data, healthy);
    writeImages(images, names.slice(1));

    const report = validateRefresh(data, images, null);

    expect(report.missingImages).toEqual([names[0]]);
    expect(report.failures).toEqual(["1 deck names have no OG image"]);
  });

  it("fails when an image matches no deck name", () => {
    const data = tmp();
    const images = tmp();
    writeImages(images, [...writeWindows(data, healthy), "retired-deck"]);

    const report = validateRefresh(data, images, null);

    expect(report.orphanImages).toEqual(["retired-deck"]);
    expect(report.failures).toEqual(["1 OG images match no deck name"]);
  });

  it("fails when a window falls below half the previous snapshot", () => {
    const data = tmp();
    const images = tmp();
    const previous = tmp();
    writeImages(images, writeWindows(data, healthy));
    writeWindows(previous, { ...healthy, "10d": 40 });

    const report = validateRefresh(data, images, previous);

    expect(report.windows[0]).toEqual({ window: "10d", archetypes: 12, floor: 20, previous: 40 });
    expect(report.failures).toEqual(["10d: 12 archetypes, floor 20 (half of 40)"]);
  });

  it("keeps the code floor when no previous snapshot exists", () => {
    const data = tmp();
    const images = tmp();
    writeImages(images, writeWindows(data, { ...healthy, "10d": 5 }));

    const report = validateRefresh(data, images, null);

    expect(report.windows[0]).toEqual({ window: "10d", archetypes: 5, floor: 12, previous: null });
    expect(report.failures).toEqual(["10d: 5 archetypes, floor 12"]);
  });

  it("fails when the default file is not the 20d copy", () => {
    const data = tmp();
    const images = tmp();
    writeImages(images, writeWindows(data, healthy));
    fs.writeFileSync(path.join(data, "best-decks.json"), "[]");

    const report = validateRefresh(data, images, null);

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
      const images = tmp();
      const previous = tmp();
      writeImages(images, writeWindows(data, healthy));
      writeWindows(previous, { ...healthy, [window]: previousCount });

      const report = validateRefresh(data, images, previous);

      const row = report.windows.find((entry) => entry.window === window);
      expect(row?.floor).toBe(floor);
      expect(row?.archetypes).toBe(current);
      expect(report.failures).toEqual([
        `${window}: ${current} archetypes, floor ${floor} (half of ${previousCount})`,
      ]);
    }
  );

  it("fails when the default file is missing", () => {
    const data = tmp();
    const images = tmp();
    writeImages(images, writeWindows(data, healthy));
    fs.rmSync(path.join(data, "best-decks.json"));

    const report = validateRefresh(data, images, null);

    expect(report.failures).toEqual(["best-decks.json is missing"]);
  });

  it("throws when the previous snapshot lacks a window file", () => {
    const data = tmp();
    const images = tmp();
    const previous = tmp();
    writeImages(images, writeWindows(data, healthy));
    writeWindows(previous, healthy);
    fs.rmSync(path.join(previous, "best-decks-30d.json"));

    expect(() => validateRefresh(data, images, previous)).toThrow(
      /best-decks-30d\.json/
    );
  });

  it("throws when a window file is missing", () => {
    const data = tmp();
    const images = tmp();
    writeWindows(data, healthy);
    fs.rmSync(path.join(data, "best-decks-30d.json"));

    expect(() => validateRefresh(data, images, null)).toThrow(/best-decks-30d\.json/);
  });
});
