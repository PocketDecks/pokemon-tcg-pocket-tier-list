// analysis/src/utils/build-matchup-data.ts
import { PipelineMatchupData } from "../../../src/types/pipeline-data";

/**
 * Converts per-opponent win/loss tallies into the winRate-bearing rows
 * matchup-data.json stores, and appends a synthetic "Total" row summing
 * every opponent, the row DeckDetailPage.tsx and DeckFinderPage.tsx read.
 */
export const buildMatchupData = (
  matchupResults: Record<string, Record<string, { wins: number; losses: number }>>
): PipelineMatchupData => {
  const matchupData: PipelineMatchupData = {};

  for (const [deckName, matchups] of Object.entries(matchupResults)) {
    let totalWins = 0;
    let totalLosses = 0;

    matchupData[deckName] = Object.entries(matchups).map(([opponent, { wins, losses }]) => {
      totalWins += wins;
      totalLosses += losses;
      const totalGames = wins + losses;
      return {
        name: opponent,
        winRate: totalGames > 0 ? wins / totalGames : 0,
        totalGames,
      };
    });

    const totalGames = totalWins + totalLosses;
    const winRate = totalGames > 0 ? totalWins / totalGames : 0;
    matchupData[deckName].push({ name: "Total", winRate, totalGames });
  }

  return matchupData;
};
