import { PipelineMatchupData } from "../../../src/types/pipeline-data";
import { buildMatchupData } from "./build-matchup-data";
import { calculateMatchupResults } from "./calculate-matchup-results";
import { Deck } from "./types";

export interface MatchupPopulations {
  publicMatchupData: PipelineMatchupData;
  powerMatchupData: PipelineMatchupData;
}

// Two tallies over the same deck names: public rows count every player,
// Power Score reads the qualified population its shares come from.
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
