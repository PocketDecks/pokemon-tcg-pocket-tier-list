import { describe, expect, it } from "vitest";

import { trimMetaShare } from "../utils/trim-free-window";
import { PipelineMetaShare } from "../../../src/types/pipeline-data";

const share = (): PipelineMetaShare => ({
  generatedAt: "2026-11-07T00:00:00.000Z",
  windowDays: 20,
  decks: ["alpha", "beta", "gamma"].map((name, index) => ({
    name,
    share: 0.5 - index * 0.1,
    sharePrev: 0.4,
    delta: 0.1 - index * 0.1,
    windowGames: 200 - index * 10,
    firstSeen: "2026-10-01",
    isNew: index === 0,
  })),
});

describe("trimMetaShare", () => {
  it("keeps the full entry for a free deck", () => {
    const trimmed = trimMetaShare(share(), new Set(["alpha"]));

    expect(trimmed.decks[0]).toEqual(share().decks[0]);
  });

  it("reduces every other deck to name, share and window games", () => {
    const trimmed = trimMetaShare(share(), new Set(["alpha"]));

    expect(trimmed.decks[1]).toEqual({ name: "beta", share: 0.4, windowGames: 190 });
    expect(Object.keys(trimmed.decks[2])).toEqual(["name", "share", "windowGames"]);
  });

  it("keeps the order and the window header", () => {
    const trimmed = trimMetaShare(share(), new Set(["alpha"]));

    expect(trimmed.decks.map((entry) => entry.name)).toEqual(["alpha", "beta", "gamma"]);
    expect(trimmed.generatedAt).toBe("2026-11-07T00:00:00.000Z");
    expect(trimmed.windowDays).toBe(20);
  });
});
