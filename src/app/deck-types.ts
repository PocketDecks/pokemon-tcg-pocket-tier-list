import type { ResolvedDeck } from "./deck-resolution";
import type { PipelineMatchupEntry } from "../types/pipeline-data";

export interface FullDeckType extends ResolvedDeck {
  popularity: number;
  percentOfGames: number;
}

export type MatchupType = PipelineMatchupEntry;
