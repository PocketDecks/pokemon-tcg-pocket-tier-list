import { PipelineCard, PipelineMatchupEntry, PipelineDeckList, PipelinePartialDeck } from "../../../src/types/pipeline-data";

// A single card as it appears in the pipeline.
export type Card = PipelineCard;

// A deck after enrichment with results, names, and recency multiplier.
export interface Deck {
  id: string;
  name: string;
  cards: Card[];
  pokemon: number;
  differentPokemon: number;
  winCount: number;
  lossCount: number;
  totalGames: number;
  date: string;
  tournamentExPercent: number;
  noTrainerPercent: number;
  wins: string[];
  losses: string[];
  // Recency weight set by applyMultipliers; defaults to 1 when unset so older code paths and tests still behave.
  multiplier?: number;
}

// A tournament fetched from Limitless.
export interface Tournament {
  id: string;
  date: string;
  players?: number;
}

// One bracket pairing within a tournament.
export interface Pairing {
  winner: string;
  player1: string;
  player2: string;
}

// Aggregate wins and losses for one archetype matchup.
export interface MatchupResult {
  wins: number;
  losses: number;
}

// A matchup row as stored in matchup-data.json.
export type MatchupData = PipelineMatchupEntry;

// A single deck list with canonical card ids and its score.
export type DeckList = PipelineDeckList;

// A ranked archetype with its lists and scores.
export type PartialDeck = PipelinePartialDeck;

