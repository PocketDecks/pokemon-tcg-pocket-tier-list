import { Deck, MatchupResult } from "./types";

const processOpponentResults = (
  matchupResults: Map<string, MatchupResult>,
  opponents: string[],
  isWin: boolean,
  weight: number
): void => {
  for (const opponent of opponents) {
    const currentResult = matchupResults.get(opponent) ?? {
      wins: 0,
      losses: 0,
    };
    matchupResults.set(opponent, {
      ...currentResult,
      [isWin ? "wins" : "losses"]:
        currentResult[isWin ? "wins" : "losses"] + weight,
    });
  }
};

// Tallies wins and losses per opponent for one archetype across all decks.
export const calculateMatchupResults = (
  decks: Deck[],
  deckName: string
): Record<string, MatchupResult> => {
  if (!decks?.length || !deckName) {
    return {};
  }

  const matchupResults = new Map<string, MatchupResult>();
  const matchingDecks = decks.filter((deck) => deck.name === deckName);

  for (const deck of matchingDecks) {
    // Use the recency multiplier so matchup-data is weighted consistently
    // with the popularity / winrate numbers used elsewhere. Falls back to 1
    // for decks that haven't been through applyMultipliers (e.g. in tests).
    const weight = deck.multiplier ?? 1;
    processOpponentResults(matchupResults, deck.wins, true, weight);
    processOpponentResults(matchupResults, deck.losses, false, weight);
  }

  return Object.fromEntries(matchupResults) as Record<string, MatchupResult>;
};
