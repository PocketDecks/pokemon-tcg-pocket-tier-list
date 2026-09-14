import type { CardType } from "./cards-api";
import type { FullList } from "./deck-resolution";
import type { PipelineMatchupEntry } from "../types/pipeline-data";

export type FullDeckType = {
  id: string;
  name: string;
  lists: FullList[];
  bestList: FullList;
  score: number;
  popularity: number;
  strength: number;
  expectedWinRate: number;
  fieldCoverage: number;
  powerScore: number | null;
  freqScore: number;
  metaScore: number | null;
  percentOfGames: number;
  matchups: PipelineMatchupEntry[] | undefined;
  iconPrimary: CardType;
  iconSecondary: CardType | null;
};

export type MatchupType = PipelineMatchupEntry;