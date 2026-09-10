import { Deck } from "./types";
import { PipelinePartialDeck, PipelineTrendRow } from "../../../src/types/pipeline-data";

// Builds the daily meta-share trend series for the top 6 archetypes as a
// percentage of that day's qualified games. bestDecks must be pre-sorted by
// score descending, so the first six entries are the top six.
export const buildTrends = (
  qualifiedDecks: Deck[],
  bestDecks: PipelinePartialDeck[]
): PipelineTrendRow[] => {
  const top6Names = bestDecks.slice(0, 6).map((d) => d.name);

  // Day accumulators keep date/totalGames separate from per-archetype tallies, which a single Record<string, number> view would mistype.
  const trendData: Record<string, { date: string; totalGames: number; counts: Record<string, number> }> = {};

  for (const deck of qualifiedDecks) {
    const dateStr = deck.date.split("T")[0];

    if (!trendData[dateStr]) {
      trendData[dateStr] = { date: dateStr, totalGames: 0, counts: {} };
      top6Names.forEach((name) => (trendData[dateStr].counts[name] = 0));
    }

    trendData[dateStr].totalGames += deck.totalGames;
    if (top6Names.includes(deck.name)) {
      trendData[dateStr].counts[deck.name] += deck.totalGames;
    }
  }

  return Object.values(trendData)
    .map((day) => {
      const result: PipelineTrendRow = { date: day.date };
      top6Names.forEach((name) => {
        result[name] = day.totalGames > 0 ? (day.counts[name] / day.totalGames) * 100 : 0;
      });
      return result;
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};
