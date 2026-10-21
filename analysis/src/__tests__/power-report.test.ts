import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PipelinePartialDeck } from "../../../src/types/pipeline-data";
import {
  formatPowerReport,
  main,
  readPowerReport,
} from "../../scripts/power-report";

const deck = (
  overrides: Partial<PipelinePartialDeck> & { name: string }
): PipelinePartialDeck => ({
  lists: [],
  popularity: 0,
  percentOfGames: 0,
  score: 0,
  expectedWinRate: 0.5,
  fieldCoverage: 0,
  powerScore: null,
  freqScore: 0,
  metaScore: null,
  ...overrides,
});

const published: PipelinePartialDeck[] = [
  deck({
    name: "alpha",
    powerScore: 90.5,
    freqScore: 100,
    metaScore: 95.2,
    fieldCoverage: 0.91,
  }),
  deck({ name: "beta", freqScore: 40.2, fieldCoverage: 0.11 }),
  deck({
    name: "gamma",
    powerScore: 70.4,
    freqScore: 60.5,
    metaScore: 65.4,
    fieldCoverage: 0.52,
  }),
];

const shareEntry = (name: string, windowGames: number) => ({
  name,
  share: 0.2,
  sharePrev: 0.2,
  delta: 0,
  windowGames,
  firstSeen: "2026-10-01",
  isNew: false,
});

const share = {
  generatedAt: "2026-10-20T18:35:46.934Z",
  windowDays: 20,
  decks: [
    shareEntry("alpha", 400),
    shareEntry("beta", 200),
    shareEntry("gamma", 300),
  ],
};

const matchupRows = (winRate: number) => [
  { name: "Total", winRate, totalGames: 500 },
  { name: "alpha", winRate, totalGames: 200 },
  { name: "beta", winRate, totalGames: 150 },
  { name: "gamma", winRate, totalGames: 150 },
];

const defaultMatchups = () => ({
  alpha: matchupRows(0.55),
  beta: matchupRows(0.45),
  gamma: matchupRows(0.6),
});

const writeFixture = (matchups: unknown = defaultMatchups()): string => {
  const dataDir = mkdtempSync(join(tmpdir(), "power-report-"));
  writeFileSync(join(dataDir, "best-decks.json"), JSON.stringify(published));
  writeFileSync(join(dataDir, "meta-share.json"), JSON.stringify(share));
  writeFileSync(join(dataDir, "matchup-data.json"), JSON.stringify(matchups));
  return dataDir;
};

describe("power report", () => {
  it("ranks the published rows and reports the snapshot it read", () => {
    const report = readPowerReport({ dataDir: writeFixture() });

    expect(report.ranked.map((row) => row.name)).toEqual(["alpha", "gamma"]);
    expect(report.unranked.map((row) => row.name)).toEqual(["beta"]);
    expect(formatPowerReport(report).split("\n")).toEqual([
      "snapshot: best-decks.json (20d window), generated 2026-10-20T18:35:46.934Z",
      "ranked 2/3",
      "",
      "rank  power   freq    meta    cov   deck",
      "   1   90.5   100.0    95.2   0.91  alpha",
      "   2   70.4    60.5    65.4   0.52  gamma",
      "",
      "unranked (1):",
      "  cov=0.11  freq=40.2  beta",
    ]);
  });

  it("ignores the public matchup rows the published scores were not built from", () => {
    const withoutMatchups = formatPowerReport(
      readPowerReport({ dataDir: writeFixture() })
    );
    const withMatchups = formatPowerReport(
      readPowerReport({
        dataDir: writeFixture({
          alpha: matchupRows(0.05),
          beta: matchupRows(0.05),
          gamma: matchupRows(0.95),
        }),
      })
    );

    expect(withMatchups).toBe(withoutMatchups);
  });

  it("prints through the CLI entry point without private data", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const report = main({ dataDir: writeFixture() });

    expect(log).toHaveBeenCalledWith(formatPowerReport(report));
    expect(report.ranked).toHaveLength(2);
    log.mockRestore();
  });
});
