import {
  PipelineMatchupData,
  PipelineMetaShare,
} from "../../../src/types/pipeline-data";

const TOTAL_ROW = "Total";

export const trimMatchupData = (
  data: PipelineMatchupData,
  freeNames: ReadonlySet<string>
): PipelineMatchupData =>
  Object.fromEntries(
    Object.entries(data).map(([name, rows]) => [
      name,
      freeNames.has(name) ? rows : rows.filter((row) => row.name === TOTAL_ROW),
    ])
  );

export const trimMetaShare = (
  metaShare: PipelineMetaShare,
  freeNames: ReadonlySet<string>
): PipelineMetaShare => ({
  ...metaShare,
  decks: metaShare.decks.map((entry) =>
    freeNames.has(entry.name)
      ? entry
      : { name: entry.name, share: entry.share, windowGames: entry.windowGames }
  ),
});
