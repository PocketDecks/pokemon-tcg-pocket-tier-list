import { describe, expect, it } from "vitest";
import {
  DEFAULT_META_WINDOW,
  META_WINDOW_LABEL_KEYS,
  META_WINDOWS,
  isPremiumMetaWindow,
  metaWindowDataPath,
} from "../meta-window";

describe("meta windows", () => {
  it("defaults to the 20-day window", () => {
    expect(DEFAULT_META_WINDOW).toBe("20d");
  });

  it("lists the four windows shortest first", () => {
    expect(META_WINDOWS).toEqual(["10d", "20d", "30d", "all"]);
  });

  it("gates 30d and All Time behind Premium", () => {
    expect(META_WINDOWS.filter(isPremiumMetaWindow)).toEqual(["30d", "all"]);
  });

  it("reads the un-suffixed artefact set for the default window", () => {
    expect(metaWindowDataPath("best-decks", "20d")).toBe("/data/best-decks.json");
  });

  it("derives every other window's path from the base name", () => {
    expect(metaWindowDataPath("best-decks", "10d")).toBe("/data/best-decks-10d.json");
    expect(metaWindowDataPath("meta-share", "30d")).toBe("/data/meta-share-30d.json");
    expect(metaWindowDataPath("matchup-data", "all")).toBe(
      "/data/matchup-data-all.json"
    );
  });

  it("has a translation key for every window", () => {
    for (const metaWindow of META_WINDOWS) {
      expect(META_WINDOW_LABEL_KEYS[metaWindow]).toBe(`window.${metaWindow}`);
    }
  });
});
