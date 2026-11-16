import { describe, expect, it } from "vitest";
import { DEFAULT_WINDOW, WINDOW_IDS, isPremiumWindow } from "../../types/meta-windows";
import { META_WINDOW_LABEL_KEYS, metaWindowDataPath, parseMetaWindow } from "../meta-window";

describe("meta windows", () => {
  it("defaults to the 20-day window", () => {
    expect(DEFAULT_WINDOW).toBe("20d");
  });

  it("lists the four windows shortest first", () => {
    expect(WINDOW_IDS).toEqual(["10d", "20d", "30d", "all"]);
  });

  it("gates 30d and All Time behind Premium", () => {
    expect(WINDOW_IDS.filter(isPremiumWindow)).toEqual(["30d", "all"]);
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
    for (const metaWindow of WINDOW_IDS) {
      expect(META_WINDOW_LABEL_KEYS[metaWindow]).toBe(`window.${metaWindow}`);
    }
  });

  it("parses a window id from a query value", () => {
    expect(parseMetaWindow("10d")).toBe("10d");
    expect(parseMetaWindow("20d")).toBe("20d");
    expect(parseMetaWindow("30d")).toBe("30d");
    expect(parseMetaWindow("all")).toBe("all");
  });

  it("rejects anything that is not a window id", () => {
    expect(parseMetaWindow(null)).toBeNull();
    expect(parseMetaWindow("")).toBeNull();
    expect(parseMetaWindow("40d")).toBeNull();
    expect(parseMetaWindow("ALL")).toBeNull();
    expect(parseMetaWindow("toString")).toBeNull();
  });
});
