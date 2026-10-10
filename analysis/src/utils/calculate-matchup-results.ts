import { Deck, MatchupResult } from "./types";

const processOpponentResults = (
  matchupResults: Map<string, MatchupResult>,
  opponents: string[],
  isWin: boolean
): void => {
  for (const opponent of opponents) {
    const currentResult = matchupResults.get(opponent) ?? {
      wins: 0,
      losses: 0,
    };
    matchupResults.set(opponent, {
      ...currentResult,
      [isWin ? "wins" : "losses"]: currentResult[isWin ? "wins" : "losses"] + 1,
    });
  }
};

// Tallies wins and losses per opponent for one archetype across all decks.
// Every game counts once: the recency ramp is retired, so a window's games
// carry equal weight and the caller picks the window by filtering decks.
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
    processOpponentResults(matchupResults, deck.wins, true);
    processOpponentResults(matchupResults, deck.losses, false);
  }

  return Object.fromEntries(matchupResults) as Record<string, MatchupResult>;
};
