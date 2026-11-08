import { describe, expect, it } from "vitest";

import { trimMatchupData, trimMetaShare } from "../utils/trim-free-window";
import {
  PipelineMatchupData,
  PipelineMetaShare,
} from "../../../src/types/pipeline-data";

const rows = (...opponents: string[]) => [
  ...opponents.map((name) => ({ name, winRate: 0.6, totalGames: 12 })),
  { name: "Total", winRate: 0.55, totalGames: 100 },
];

const matchups = (): PipelineMatchupData => ({
  alpha: rows("beta", "gamma"),
  beta: rows("alpha"),
  gamma: rows("alpha", "beta"),
});

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

describe("trimMatchupData", () => {
  it("keeps every row for a free deck", () => {
    const trimmed = trimMatchupData(matchups(), new Set(["alpha"]));

    expect(trimmed.alpha).toEqual(matchups().alpha);
  });

  it("keeps only the Total row for every other deck", () => {
    const trimmed = trimMatchupData(matchups(), new Set(["alpha"]));

    expect(trimmed.beta).toEqual([{ name: "Total", winRate: 0.55, totalGames: 100 }]);
    expect(trimmed.gamma).toEqual([{ name: "Total", winRate: 0.55, totalGames: 100 }]);
  });

  it("keeps every deck as a key", () => {
    const trimmed = trimMatchupData(matchups(), new Set(["alpha"]));

    expect(Object.keys(trimmed)).toEqual(["alpha", "beta", "gamma"]);
  });

  it("does not change its input", () => {
    const input = matchups();

    trimMatchupData(input, new Set(["alpha"]));

    expect(input).toEqual(matchups());
  });
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
