// Prints the ranking the site publishes: cd analysis && yarn power:report
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PipelineMetaShare,
  PipelinePartialDeck,
} from "../../src/types/pipeline-data";

export const DEFAULT_DATA_DIR = join(__dirname, "..", "..", "public", "data");

export interface PowerReportSnapshot {
  file: string;
  generatedAt: string;
  windowDays: number | null;
}

export interface PowerReport {
  snapshot: PowerReportSnapshot;
  ranked: PipelinePartialDeck[];
  unranked: PipelinePartialDeck[];
}

export interface PowerReportOptions {
  dataDir?: string;
}

const readJson = <T>(dataDir: string, name: string): T =>
  JSON.parse(readFileSync(join(dataDir, name), "utf8")) as T;

const byRank = (a: PipelinePartialDeck, b: PipelinePartialDeck): number => {
  const power = (b.powerScore ?? 0) - (a.powerScore ?? 0);
  if (power !== 0) return power;
  const freq = b.freqScore - a.freqScore;
  if (freq !== 0) return freq;
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
};

const byFreq = (a: PipelinePartialDeck, b: PipelinePartialDeck): number =>
  b.freqScore - a.freqScore || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

const buildPowerReport = (
  decks: PipelinePartialDeck[],
  snapshot: PowerReportSnapshot
): PowerReport => ({
  snapshot,
  ranked: decks.filter((deck) => deck.powerScore !== null).sort(byRank),
  unranked: decks.filter((deck) => deck.powerScore === null).sort(byFreq),
});

export const readPowerReport = (
  options: PowerReportOptions = {}
): PowerReport => {
  const dataDir = options.dataDir ?? DEFAULT_DATA_DIR;
  const decks = readJson<PipelinePartialDeck[]>(dataDir, "best-decks.json");
  const share = readJson<PipelineMetaShare>(dataDir, "meta-share.json");
  return buildPowerReport(decks, {
    file: "best-decks.json",
    generatedAt: share.generatedAt,
    windowDays: share.windowDays,
  });
};

const score = (value: number | null, digits: number): string =>
  value === null ? "null" : value.toFixed(digits);

export const formatPowerReport = (report: PowerReport): string => {
  const { snapshot, ranked, unranked } = report;
  const window =
    snapshot.windowDays === null ? "all time" : `${snapshot.windowDays}d`;
  const lines = [
    `snapshot: ${snapshot.file} (${window} window), generated ${snapshot.generatedAt}`,
    `ranked ${ranked.length}/${ranked.length + unranked.length}`,
    "",
    "rank  power   freq    meta    cov   deck",
  ];
  ranked.forEach((deck, index) => {
    lines.push(
      `${String(index + 1).padStart(4)}  ${score(deck.powerScore, 1).padStart(5)}   ` +
        `${score(deck.freqScore, 1).padStart(5)}   ${score(deck.metaScore, 1).padStart(5)}   ` +
        `${score(deck.fieldCoverage, 2)}  ${deck.name}`
    );
  });
  lines.push("", `unranked (${unranked.length}):`);
  unranked.forEach((deck) =>
    lines.push(
      `  cov=${score(deck.fieldCoverage, 2)}  freq=${score(deck.freqScore, 1)}  ${deck.name}`
    )
  );
  return lines.join("\n");
};

export const main = (options: PowerReportOptions = {}): PowerReport => {
  const report = readPowerReport(options);
  console.log(formatPowerReport(report));
  return report;
};

if (require.main === module) main();
