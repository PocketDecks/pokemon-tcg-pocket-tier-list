import { PipelineMetaShare } from "../../../src/types/pipeline-data";

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
