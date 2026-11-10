import { isUnmatchedDeck } from "./get-deck-name";
import { Deck } from "./types";
import { PipelinePartialDeck, PipelineTrendRow } from "../../../src/types/pipeline-data";

export const TREND_ARCHETYPE_COUNT = 6;

type RankedDeck = PipelinePartialDeck & { powerScore: number };

const hasPowerScore = (deck: PipelinePartialDeck): deck is RankedDeck =>
  deck.powerScore !== null;

export const pickTrendNames = (
  bestDecks: readonly PipelinePartialDeck[],
  count: number = TREND_ARCHETYPE_COUNT
): string[] =>
  bestDecks
    .filter((deck) => !isUnmatchedDeck(deck.name))
    .filter(hasPowerScore)
    .sort(
      (a, b) =>
        b.powerScore - a.powerScore ||
        b.score - a.score ||
        a.name.localeCompare(b.name)
    )
    .slice(0, count)
    .map((deck) => deck.name);

export const buildTrends = (
  qualifiedDecks: Deck[],
  trendNames: readonly string[]
): PipelineTrendRow[] => {
  const trendData: Record<string, { date: string; totalGames: number; counts: Record<string, number> }> = {};

  for (const deck of qualifiedDecks) {
    const dateStr = deck.date.split("T")[0];

    if (!trendData[dateStr]) {
      trendData[dateStr] = { date: dateStr, totalGames: 0, counts: {} };
      trendNames.forEach((name) => (trendData[dateStr].counts[name] = 0));
    }

    trendData[dateStr].totalGames += deck.totalGames;
    if (trendNames.includes(deck.name)) {
      trendData[dateStr].counts[deck.name] += deck.totalGames;
    }
  }

  return Object.values(trendData)
    .map((day) => {
      const result: PipelineTrendRow = { date: day.date };
      trendNames.forEach((name) => {
        result[name] = day.totalGames > 0 ? (day.counts[name] / day.totalGames) * 100 : 0;
      });
      return result;
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};
