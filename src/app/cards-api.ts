import attackCosts from "../data/attack-costs.json";
import { RAW_CARDS } from "./constants";
import type { PokemonTCGPocketCardsV5CoreSchema } from "pokemon-tcg-pocket-cards/core";

export type RawCardType = PokemonTCGPocketCardsV5CoreSchema[number];

export interface CardType {
  id: string;
  name: string;
  rarity: string;
  pack: string;
  type: string;
  supertype: string;
  health: number | null;
  stage: string | null;
  image: string;
  ex: boolean;
  set: string;
  deckBuilderNr: number | null;
}

export const normaliseCard = (card: RawCardType): CardType => ({
  id: card.id,
  name: card.name,
  rarity: card.rarity ?? "Unknown",
  pack: card.pack,
  type: card.subtype,
  supertype: card.type,
  health: card.health ?? null,
  stage: card.stage ?? null,
  image: card.image,
  ex: card.ex ?? false,
  set: card.set_code,
  deckBuilderNr: card.deckBuilderNr ?? null,
});

export const normaliseMultipleCards = (cards: RawCardType[]): CardType[] =>
  cards.map(normaliseCard);

export type AttacksByDeckBuilderNr = Map<
  number,
  Record<string, { cost: string | null }> | undefined
>;

export const CARDS: readonly CardType[] = normaliseMultipleCards(RAW_CARDS);

export const CARDS_BY_ID: ReadonlyMap<string, CardType> = new Map(
  CARDS.map((card) => [card.id, card])
);

export const ATTACKS_BY_DECK_BUILDER_NR: AttacksByDeckBuilderNr = new Map(
  Object.entries(attackCosts).map(([nr, costs]) => [Number(nr), costs])
);
