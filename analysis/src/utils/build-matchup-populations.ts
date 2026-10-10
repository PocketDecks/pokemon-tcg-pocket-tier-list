import { PipelineMatchupData } from "../../../src/types/pipeline-data";
import { buildMatchupData } from "./build-matchup-data";
import { calculateMatchupResults } from "./calculate-matchup-results";
import { Deck } from "./types";

export interface MatchupPopulations {
  publicMatchupData: PipelineMatchupData;
  powerMatchupData: PipelineMatchupData;
}

// Two tallies over the same deck names: the public matrix counts every
// player's games so displayed win rates stay unbiased, while Power Score reads
// the qualified tally that matches the qualified field shares it weights by.
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
