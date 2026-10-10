import { PipelineMatchupData } from "../../../src/types/pipeline-data";
import { buildMatchupData } from "./build-matchup-data";
import { calculateMatchupResults } from "./calculate-matchup-results";
import { Deck } from "./types";

export interface MatchupPopulations {
  publicMatchupData: PipelineMatchupData;
  powerMatchupData: PipelineMatchupData;
}

// The public matrix keeps every deck's games, but Power Score weights its
// matchups against qualified field shares, so it reads a qualified tally.
export const buildMatchupPopulations = (
  allDecks: Deck[],
  qualifiedDecks: Deck[],
  deckNames: string[]
): MatchupPopulations => {
  const tally = (decks: Deck[]): PipelineMatchupData =>
    buildMatchupData(
      Object.fromEntries(
        deckNames.map((name) => [name, calculateMatchupResults(decks, name)])
      )
    );

  return {
    publicMatchupData: tally(allDecks),
    powerMatchupData: tally(qualifiedDecks),
  };
};
